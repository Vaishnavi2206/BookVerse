import type { LibraryBook } from "../types/form-types";

type CachedBookRecord = {
  id: string;
  userId: string;
  bookId: string;
  book: LibraryBook;
};

const DATABASE_NAME = "book-verse-library";
const DATABASE_VERSION = 1;
const STORE_NAME = "books";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("This browser does not support IndexedDB."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open the library cache."));
      request.onblocked = () =>
        reject(new Error("The library cache is blocked by another tab."));
    });
  }
  return databasePromise;
}

function recordId(userId: string, bookId: string) {
  return `${userId}:${bookId}`;
}

export async function getCachedLibraryBook(
  userId: string,
  bookId: string,
): Promise<LibraryBook | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(recordId(userId, bookId));
    request.onsuccess = () => {
      const record = request.result as CachedBookRecord | undefined;
      resolve(record?.book ?? null);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to read the library cache."));
  });
}

export async function putCachedLibraryBook(
  userId: string,
  book: LibraryBook,
): Promise<void> {
  if (!book.key) throw new Error("A book ID is required for the library cache.");
  const bookId = book.key;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      id: recordId(userId, bookId),
      userId,
      bookId,
      book,
    } satisfies CachedBookRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to save the library cache."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The library cache write was aborted."));
  });
}

export async function deleteCachedLibraryBook(
  userId: string,
  bookId: string,
): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(recordId(userId, bookId));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to update the library cache."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The library cache write was aborted."));
  });
}
