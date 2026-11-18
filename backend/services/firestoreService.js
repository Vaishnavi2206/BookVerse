const {
  applicationDefault,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT;

if (!projectId) {
  throw new Error(
    "Firebase project ID is missing. Set FIREBASE_PROJECT_ID in the environment or backend/.env.",
  );
}

const firebaseApp =
  getApps()[0] ??
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function timestampToIso(value) {
  return value?.toDate instanceof Function
    ? value.toDate().toISOString()
    : null;
}

async function serializeCollection(collectionDoc) {
  const collection = collectionDoc.data();
  const itemSnapshot = await collectionDoc.ref
    .collection("items")
    .orderBy("sortOrder")
    .get();

  return {
    id: collectionDoc.id,
    name: collection.name,
    description: collection.description ?? "",
    coverImageUrl: collection.coverImageUrl ?? "",
    isPublic: collection.isPublic === true,
    bookCount: collection.bookCount ?? itemSnapshot.size,
    likeCount: Number(collection.likeCount ?? 0),
    createdAt: timestampToIso(collection.createdAt),
    updatedAt: timestampToIso(collection.updatedAt),
    items: itemSnapshot.docs.map((itemDoc) => ({
      ...itemDoc.data(),
      addedAt: timestampToIso(itemDoc.get("addedAt")),
    })),
  };
}

async function serializeCollectionWithOwnerProfile(collectionDoc) {
  const ownerId = collectionDoc.get("ownerId");
  let ownerName = "Book Verse reader";
  let ownerPhotoUrl = null;

  if (typeof ownerId === "string" && ownerId.length > 0) {
    try {
      const owner = await auth.getUser(ownerId);
      ownerName = owner.displayName || owner.email || ownerName;
      ownerPhotoUrl = owner.photoURL || null;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }
  }

  return {
    ...(await serializeCollection(collectionDoc)),
    ownerId,
    ownerName,
    ownerPhotoUrl,
  };
}

module.exports = {
  HttpError,
  auth,
  firebaseApp,
  serializeCollection,
  serializeCollectionWithOwnerProfile,
};
