import type { CommentSyncMutation } from "./api";

type CommentOutboxRecord = {
  key: string;
  userId: string;
  bookId: string;
  mutation: CommentSyncMutation;
};

const DATABASE_NAME = "book-verse-comment-outbox";
const DATABASE_VERSION = 1;
const STORE_NAME = "mutations";
const USER_BOOK_INDEX = "by-user-book";

let databasePromise: Promise<IDBDatabase> | null = null;

function dependencyDepth(
  mutation: CommentSyncMutation,
  mutationsById: Map<string, CommentSyncMutation>,
  visited = new Set<string>(),
): number {
  if (mutation.operation !== "create" || mutation.parentId === null) return 0;
  if (visited.has(mutation.id)) return 0;
  const parent = mutationsById.get(mutation.parentId);
  if (!parent || parent.operation !== "create") return 1;
  const nextVisited = new Set(visited);
  nextVisited.add(mutation.id);
  return dependencyDepth(parent, mutationsById, nextVisited) + 1;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support IndexedDB."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: "key",
          });
          store.createIndex(USER_BOOK_INDEX, ["userId", "bookId"]);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open the comment outbox."));
      request.onblocked = () =>
        reject(new Error("The comment outbox is blocked by another tab."));
    });
  }
  return databasePromise;
}

function recordKey(userId: string, bookId: string, commentId: string) {
  return JSON.stringify([userId, bookId, commentId]);
}

export async function getPendingCommentMutations(
  userId: string,
  bookId: string,
): Promise<CommentSyncMutation[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .index(USER_BOOK_INDEX)
      .getAll(IDBKeyRange.only([userId, bookId]));
    request.onsuccess = () => {
      const records = request.result as CommentOutboxRecord[];
      const mutations = records.map(({ mutation }) => mutation);
      const mutationsById = new Map(
        mutations.map((mutation) => [mutation.id, mutation]),
      );
      resolve(
        mutations.sort(
          (left, right) =>
            dependencyDepth(left, mutationsById) -
              dependencyDepth(right, mutationsById) ||
            left.queuedAt.localeCompare(right.queuedAt),
        ),
      );
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to read pending comments."));
  });
}

export async function getPendingCommentMutation(
  userId: string,
  bookId: string,
  commentId: string,
): Promise<CommentSyncMutation | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(recordKey(userId, bookId, commentId));
    request.onsuccess = () => {
      const record = request.result as CommentOutboxRecord | undefined;
      resolve(record?.mutation ?? null);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to read the pending comment."));
  });
}

export async function putPendingCommentMutation(
  userId: string,
  bookId: string,
  mutation: CommentSyncMutation,
): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      key: recordKey(userId, bookId, mutation.id),
      userId,
      bookId,
      mutation,
    } satisfies CommentOutboxRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to save the pending comment."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The comment outbox write was aborted."));
  });
}

export async function removeAcknowledgedCommentMutations(
  userId: string,
  bookId: string,
  acknowledged: CommentSyncMutation[],
): Promise<void> {
  if (acknowledged.length === 0) return;
  const acknowledgedIds = new Map(
    acknowledged.map(({ id, mutationId }) => [id, mutationId]),
  );
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index(USER_BOOK_INDEX).getAll(
      IDBKeyRange.only([userId, bookId]),
    );
    request.onsuccess = () => {
      const records = request.result as CommentOutboxRecord[];
      for (const record of records) {
        if (
          acknowledgedIds.get(record.mutation.id) ===
          record.mutation.mutationId
        ) {
          store.delete(record.key);
        }
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to update the comment outbox."));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to update the comment outbox."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The comment outbox update was aborted."));
  });
}
