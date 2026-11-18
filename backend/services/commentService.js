const {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");
const { auth, firebaseApp, HttpError } = require("./firestoreService");

const db = getFirestore(firebaseApp);
const MAX_COMMENT_LENGTH = 500;
const MAX_BATCH_SIZE = 10;
const COMMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function getCommentsCollection(bookId) {
  const threadId = Buffer.from(bookId, "utf8").toString("base64url");
  return db.collection("bookThreads").doc(threadId).collection("comments");
}

function timestampToIso(value) {
  return value?.toDate instanceof Function ? value.toDate().toISOString() : null;
}

function serializeComment(snapshot, bookId, rootId, isRoot) {
  const data = snapshot.data();
  const createdAt = timestampToIso(data.createdAt);
  return {
    id: snapshot.id,
    bookId,
    rootId,
    parentId: data.parentId ?? null,
    userId: data.userId,
    authorName: data.authorName,
    authorPhotoUrl: data.authorPhotoUrl ?? null,
    body: data.isDeleted === true ? "" : data.body,
    createdAt,
    clientCreatedAt:
      timestampToIso(data.clientCreatedAt) ?? createdAt,
    editedAt: timestampToIso(data.editedAt),
    deletedAt: timestampToIso(data.deletedAt),
    replyCount: isRoot ? Number(data.replyCount ?? 0) : 0,
  };
}

function parseCursor(cursorCreatedAt, cursorId) {
  if (!cursorCreatedAt && !cursorId) return null;
  const date = new Date(cursorCreatedAt);
  if (
    typeof cursorCreatedAt !== "string" ||
    Number.isNaN(date.getTime()) ||
    typeof cursorId !== "string" ||
    !COMMENT_ID_PATTERN.test(cursorId)
  ) {
    throw new HttpError(400, "The comment page cursor is invalid.");
  }
  return { timestamp: Timestamp.fromDate(date), id: cursorId };
}

function parseLimit(value, fallback, maximum) {
  const limit = Number(value ?? fallback);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new HttpError(400, `The page limit must be between 1 and ${maximum}.`);
  }
  return limit;
}

function buildPage(query, bookId, rootId, isRoot, replyCount, limit) {
  return query.get().then((snapshot) => ({
    comments: snapshot.docs.map((doc) =>
      serializeComment(doc, bookId, rootId ?? doc.id, isRoot),
    ),
    nextCursor:
      snapshot.size === limit
        ? {
            createdAt: timestampToIso(
              snapshot.docs[snapshot.docs.length - 1].get("createdAt"),
            ),
            id: snapshot.docs[snapshot.docs.length - 1].id,
          }
        : null,
    ...(replyCount === undefined ? {} : { replyCount }),
  }));
}

async function getBookComments(bookId, options = {}) {
  if (typeof bookId !== "string" || bookId.trim().length === 0 || bookId.length > 1000) {
    throw new HttpError(400, "A valid book ID is required.");
  }
  const sort = options.sort ?? "newest";
  if (sort !== "newest" && sort !== "oldest") {
    throw new HttpError(400, "Comment sort must be newest or oldest.");
  }

  const limit = parseLimit(options.limit, 20, 50);
  const cursor = parseCursor(options.cursorCreatedAt, options.cursorId);
  const direction = sort === "newest" ? "desc" : "asc";
  let query = getCommentsCollection(bookId)
    .orderBy("createdAt", direction)
    .orderBy(FieldPath.documentId(), direction);
  if (cursor) query = query.startAfter(cursor.timestamp, cursor.id);
  query = query.limit(limit);
  return buildPage(query, bookId, null, true, undefined, limit);
}

async function getBookCommentReplies(bookId, rootId, options = {}) {
  if (typeof bookId !== "string" || bookId.trim().length === 0 || bookId.length > 1000) {
    throw new HttpError(400, "A valid book ID is required.");
  }
  if (typeof rootId !== "string" || !COMMENT_ID_PATTERN.test(rootId)) {
    throw new HttpError(400, "A valid root comment ID is required.");
  }

  const rootRef = getCommentsCollection(bookId).doc(rootId);
  const rootSnapshot = await rootRef.get();
  if (!rootSnapshot.exists || rootSnapshot.get("bookId") !== bookId) {
    throw new HttpError(404, "The comment thread was not found.");
  }

  const limit = parseLimit(options.limit, 50, 100);
  const cursor = parseCursor(options.cursorCreatedAt, options.cursorId);
  let query = rootRef
    .collection("replies")
    .orderBy("createdAt", "asc")
    .orderBy(FieldPath.documentId(), "asc");
  if (cursor) query = query.startAfter(cursor.timestamp, cursor.id);
  query = query.limit(limit);
  return buildPage(
    query,
    bookId,
    rootId,
    false,
    Number(rootSnapshot.get("replyCount") ?? 0),
    limit,
  );
}

function validateMutation(mutation) {
  if (!mutation || typeof mutation !== "object") {
    throw new HttpError(400, "Each comment mutation must be an object.");
  }
  if (
    typeof mutation.mutationId !== "string" ||
    !COMMENT_ID_PATTERN.test(mutation.mutationId) ||
    typeof mutation.id !== "string" ||
    !COMMENT_ID_PATTERN.test(mutation.id) ||
    typeof mutation.rootId !== "string" ||
    !COMMENT_ID_PATTERN.test(mutation.rootId) ||
    (mutation.parentId !== null &&
      (typeof mutation.parentId !== "string" ||
        !COMMENT_ID_PATTERN.test(mutation.parentId)))
  ) {
    throw new HttpError(400, "A comment mutation contains an invalid ID.");
  }
  if (!["create", "edit", "delete"].includes(mutation.operation)) {
    throw new HttpError(400, "The comment operation is invalid.");
  }
  if (
    typeof mutation.clientCreatedAt !== "string" ||
    Number.isNaN(new Date(mutation.clientCreatedAt).getTime())
  ) {
    throw new HttpError(400, "A valid comment creation time is required.");
  }
  if (mutation.operation === "create") {
    const isDeleted = mutation.deleted === true;
    if (
      (mutation.parentId === null && mutation.rootId !== mutation.id) ||
      (mutation.parentId !== null && mutation.rootId === mutation.id) ||
      typeof mutation.body !== "string" ||
      mutation.body.length > MAX_COMMENT_LENGTH ||
      (!isDeleted && mutation.body.trim().length === 0) ||
      (isDeleted && mutation.body.length > 0)
    ) {
      throw new HttpError(400, "The new comment is invalid.");
    }
  }
  if (mutation.operation === "edit") {
    if (
      typeof mutation.body !== "string" ||
      mutation.body.trim().length === 0 ||
      mutation.body.length > MAX_COMMENT_LENGTH
    ) {
      throw new HttpError(400, "Comment text must be between 1 and 500 characters.");
    }
  }
  return mutation;
}

function makeCommentReference(comments, mutation) {
  const rootRef = comments.doc(mutation.rootId);
  return mutation.id === mutation.rootId
    ? rootRef
    : rootRef.collection("replies").doc(mutation.id);
}

function addReference(references, reference) {
  references.set(reference.path, reference);
}

async function syncBookComments(userId, bookId, rawMutations) {
  if (typeof bookId !== "string" || bookId.trim().length === 0 || bookId.length > 1000) {
    throw new HttpError(400, "A valid book ID is required.");
  }
  if (
    !Array.isArray(rawMutations) ||
    rawMutations.length < 1 ||
    rawMutations.length > MAX_BATCH_SIZE
  ) {
    throw new HttpError(400, `A sync batch must contain 1 to ${MAX_BATCH_SIZE} mutations.`);
  }

  const mutations = rawMutations.map(validateMutation);
  const mutationIds = new Set();
  const commentIds = new Set();
  for (const mutation of mutations) {
    if (mutationIds.has(mutation.mutationId) || commentIds.has(mutation.id)) {
      throw new HttpError(400, "A sync batch cannot contain duplicate comment IDs.");
    }
    mutationIds.add(mutation.mutationId);
    commentIds.add(mutation.id);
  }

  let author;
  try {
    author = await auth.getUser(userId);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      throw new HttpError(401, "The signed-in account is no longer available.");
    }
    throw error;
  }
  const comments = getCommentsCollection(bookId);
  const plannedCreates = new Map(
    mutations
      .filter((mutation) => mutation.operation === "create")
      .map((mutation) => [mutation.id, mutation]),
  );

  const acknowledgedMutationIds = await db.runTransaction(async (transaction) => {
    const references = new Map();
    for (const mutation of mutations) {
      const rootRef = comments.doc(mutation.rootId);
      addReference(references, rootRef);
      addReference(references, makeCommentReference(comments, mutation));
      if (
        mutation.operation === "create" &&
        mutation.parentId !== null &&
        mutation.parentId !== mutation.rootId &&
        !plannedCreates.has(mutation.parentId)
      ) {
        addReference(
          references,
          rootRef.collection("replies").doc(mutation.parentId),
        );
      }
    }

    const snapshots = await transaction.getAll(...references.values());
    const snapshotByPath = new Map(
      snapshots.map((snapshot) => [snapshot.ref.path, snapshot]),
    );
    const plannedRootIds = new Set(
      mutations
        .filter(
          (mutation) =>
            mutation.operation === "create" &&
            mutation.parentId === null &&
            mutation.rootId === mutation.id,
        )
        .map((mutation) => mutation.id),
    );
    const newMutations = [];
    const replyCountIncrements = new Map();
    const updatesByPath = new Map();

    for (const mutation of mutations) {
      const rootRef = comments.doc(mutation.rootId);
      const rootSnapshot = snapshotByPath.get(rootRef.path);
      if (
        !rootSnapshot?.exists &&
        !plannedRootIds.has(mutation.rootId)
      ) {
        throw new HttpError(404, "The comment thread was not found.");
      }
      if (rootSnapshot?.exists && rootSnapshot.get("bookId") !== bookId) {
        throw new HttpError(404, "The comment thread was not found.");
      }

      const targetRef = makeCommentReference(comments, mutation);
      const targetSnapshot = snapshotByPath.get(targetRef.path);
      if (mutation.operation === "create") {
        if (targetSnapshot?.exists) {
          if (targetSnapshot.get("userId") !== userId) {
            throw new HttpError(409, "That comment ID is already in use.");
          }
          continue;
        }

        if (mutation.parentId !== null) {
          const plannedParent = plannedCreates.get(mutation.parentId);
          if (plannedParent) {
            if (plannedParent.rootId !== mutation.rootId) {
              throw new HttpError(400, "A reply must belong to its parent thread.");
            }
          } else {
            const parentRef =
              mutation.parentId === mutation.rootId
                ? rootRef
                : rootRef.collection("replies").doc(mutation.parentId);
            const parentSnapshot = snapshotByPath.get(parentRef.path);
            if (
              !parentSnapshot?.exists ||
              parentSnapshot.get("rootId") !== mutation.rootId
            ) {
              throw new HttpError(404, "The reply parent was not found.");
            }
          }
          replyCountIncrements.set(
            mutation.rootId,
            (replyCountIncrements.get(mutation.rootId) ?? 0) + 1,
          );
        }
        newMutations.push(mutation);
        continue;
      }

      if (!targetSnapshot?.exists) {
        throw new HttpError(404, "The comment was not found.");
      }
      if (
        targetSnapshot.get("userId") !== userId ||
        targetSnapshot.get("rootId") !== mutation.rootId
      ) {
        throw new HttpError(403, "You can only edit or delete your own comments.");
      }
    }

    const newRootIds = new Set(
      newMutations
        .filter(
          (mutation) =>
            mutation.parentId === null && mutation.rootId === mutation.id,
        )
        .map((mutation) => mutation.id),
    );
    for (const mutation of newMutations) {
      const reference = makeCommentReference(comments, mutation);
      const isRoot = mutation.parentId === null;
      const isDeleted = mutation.deleted === true;
      const data = {
        bookId,
        rootId: mutation.rootId,
        parentId: mutation.parentId,
        userId,
        authorName: author.displayName || "Book Verse reader",
        authorPhotoUrl: author.photoURL || null,
        body: isDeleted ? "" : mutation.body.trim(),
        isDeleted,
        createdAt: FieldValue.serverTimestamp(),
        clientCreatedAt: new Date(mutation.clientCreatedAt),
        editedAt: null,
        deletedAt: isDeleted ? FieldValue.serverTimestamp() : null,
        replyCount: isRoot
          ? replyCountIncrements.get(mutation.rootId) ?? 0
          : 0,
      };
      transaction.create(reference, data);
    }

    for (const [rootId, increment] of replyCountIncrements) {
      if (newRootIds.has(rootId)) continue;
      const rootRef = comments.doc(rootId);
      updatesByPath.set(rootRef.path, {
        reference: rootRef,
        fields: { replyCount: FieldValue.increment(increment) },
      });
    }

    for (const mutation of mutations) {
      if (mutation.operation === "edit") {
        const reference = makeCommentReference(comments, mutation);
        const update = updatesByPath.get(reference.path) ?? {
          reference,
          fields: {},
        };
        Object.assign(update.fields, {
          body: mutation.body.trim(),
          editedAt: FieldValue.serverTimestamp(),
        });
        updatesByPath.set(reference.path, update);
      } else if (mutation.operation === "delete") {
        const reference = makeCommentReference(comments, mutation);
        const update = updatesByPath.get(reference.path) ?? {
          reference,
          fields: {},
        };
        Object.assign(update.fields, {
          body: "",
          isDeleted: true,
          deletedAt: FieldValue.serverTimestamp(),
          editedAt: FieldValue.serverTimestamp(),
        });
        updatesByPath.set(reference.path, update);
      }
    }

    for (const { reference, fields } of updatesByPath.values()) {
      transaction.update(reference, fields);
    }

    const replyCounts = Object.create(null);
    for (const mutation of mutations) {
      const rootId = mutation.rootId;
      if (Object.hasOwn(replyCounts, rootId)) continue;
      const rootRef = comments.doc(rootId);
      const rootSnapshot = snapshotByPath.get(rootRef.path);
      const oldCount = Number(rootSnapshot?.get("replyCount") ?? 0);
      const newRoot = newRootIds.has(rootId);
      replyCounts[rootId] = newRoot
        ? replyCountIncrements.get(rootId) ?? 0
        : oldCount + (replyCountIncrements.get(rootId) ?? 0);
    }

    return {
      acknowledgedMutationIds: mutations.map((mutation) => mutation.mutationId),
      replyCounts,
    };
  });

  return { success: true, ...acknowledgedMutationIds };
}

module.exports = {
  getBookCommentReplies,
  getBookComments,
  syncBookComments,
};
