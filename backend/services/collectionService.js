const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const {
  HttpError,
  firebaseApp,
  serializeCollection,
  serializeCollectionWithOwnerProfile,
} = require("./firestoreService");
const db = getFirestore(firebaseApp);

function collectionItemId(bookId) {
  return Buffer.from(bookId, "utf8").toString("base64url");
}

async function getCollections(userId) {
  const snapshot = await db
    .collection("collections")
    .where("ownerId", "==", userId)
    .get();
  return Promise.all(snapshot.docs.map(serializeCollection));
}

async function getPublicCollections() {
  const snapshot = await db
    .collection("collections")
    .where("isPublic", "==", true)
    .get();
  return Promise.all(snapshot.docs.map(serializeCollection));
}

async function saveCollection(userId, collectionId) {
  if (
    typeof collectionId !== "string" ||
    collectionId.length === 0 ||
    collectionId.includes("/")
  ) {
    throw new HttpError(400, "A valid collection ID is required.");
  }

  const collectionRef = db.collection("collections").doc(collectionId);
  const savedCollectionRef = db
    .collection("users")
    .doc(userId)
    .collection("savedCollections")
    .doc(collectionId);

  await db.runTransaction(async (transaction) => {
    const [collectionSnapshot, savedSnapshot] = await Promise.all([
      transaction.get(collectionRef),
      transaction.get(savedCollectionRef),
    ]);

    if (!collectionSnapshot.exists || collectionSnapshot.get("isPublic") !== true) {
      throw new HttpError(404, "Public collection not found.");
    }
    if (collectionSnapshot.get("ownerId") === userId) {
      throw new HttpError(400, "You cannot save your own collection.");
    }
    if (!savedSnapshot.exists) {
      transaction.set(savedCollectionRef, {
        collectionId,
        savedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  const collectionSnapshot = await collectionRef.get();
  if (!collectionSnapshot.exists || collectionSnapshot.get("isPublic") !== true) {
    throw new HttpError(404, "Public collection not found.");
  }
  return serializeCollectionWithOwnerProfile(collectionSnapshot);
}

async function setCollectionLike(userId, collectionId, liked) {
  if (
    typeof collectionId !== "string" ||
    collectionId.length === 0 ||
    collectionId.includes("/")
  ) {
    throw new HttpError(400, "A valid collection ID is required.");
  }
  if (typeof liked !== "boolean") {
    throw new HttpError(400, "liked must be a boolean.");
  }

  const collectionRef = db.collection("collections").doc(collectionId);
  const likeRef = db
    .collection("users")
    .doc(userId)
    .collection("likedCollections")
    .doc(collectionId);
  let likeCount = 0;

  await db.runTransaction(async (transaction) => {
    const [collectionSnapshot, likeSnapshot] = await Promise.all([
      transaction.get(collectionRef),
      transaction.get(likeRef),
    ]);

    if (
      !collectionSnapshot.exists ||
      collectionSnapshot.get("isPublic") !== true
    ) {
      throw new HttpError(404, "Public collection not found.");
    }

    const currentlyLiked = likeSnapshot.exists;
    const currentCount = Number(collectionSnapshot.get("likeCount") ?? 0);
    if (currentlyLiked !== liked) {
      if (liked) {
        transaction.set(likeRef, {
          collectionId,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(collectionRef, {
          likeCount: FieldValue.increment(1),
        });
      } else {
        transaction.delete(likeRef);
        transaction.update(collectionRef, {
          likeCount: Math.max(0, currentCount - 1),
        });
      }
    }

    likeCount = Math.max(
      0,
      currentCount + (currentlyLiked === liked ? 0 : liked ? 1 : -1),
    );
  });

  return { success: true, liked, likeCount };
}

async function removeBookFromCollection(userId, collectionId, bookId) {
  if (typeof bookId !== "string" || bookId.length === 0) {
    throw new HttpError(400, "bookId is required.");
  }

  const collectionRef = db.collection("collections").doc(collectionId);
  const itemRef = collectionRef
    .collection("items")
    .doc(collectionItemId(bookId));
  await db.runTransaction(async (transaction) => {
    const collectionSnapshot = await transaction.get(collectionRef);
    if (
      !collectionSnapshot.exists ||
      collectionSnapshot.get("ownerId") !== userId
    ) {
      throw new HttpError(404, "Collection not found.");
    }
    const itemSnapshot = await transaction.get(itemRef);
    if (!itemSnapshot.exists) return;

    transaction.delete(itemRef);
    transaction.update(collectionRef, {
      bookCount: Math.max(
        0,
        Number(collectionSnapshot.get("bookCount") ?? 0) - 1,
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { success: true };
}

module.exports = {
  getCollections,
  getPublicCollections,
  saveCollection,
  setCollectionLike,
  removeBookFromCollection,
};
