const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const {
  HttpError,
  firebaseApp,
  serializeCollection,
  serializeCollectionWithOwnerProfile,
} = require("./firestoreService");
const db = getFirestore(firebaseApp);

async function serializeCollectionWithOwner(collectionSnapshot) {
  return {
    ...(await serializeCollection(collectionSnapshot)),
    ownerId: collectionSnapshot.get("ownerId"),
  };
}

function collectionItemId(bookId) {
  return Buffer.from(bookId, "utf8").toString("base64url");
}

function libraryDocumentId(userId, bookId) {
  return `${userId}_${collectionItemId(bookId)}`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateString(value, optional = false) {
  if (optional && (value === undefined || value === "")) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeLibraryFields(value) {
  if (!isRecord(value)) {
    throw new HttpError(400, "libraryFields must be an object.");
  }

  const {
    readingStatus,
    readingFormat,
    personalRating,
    isFavourite,
    currentPage,
    dateAdded,
    readingStartDate,
    targetCompletionDate,
    reviewTitle,
    reviewText,
    readingGoalEnabled,
    dailyPageGoal,
    favouriteQuote,
    privateNote,
  } = value;

  if (
    !["Want to Read", "Reading", "Completed", "Paused", "Did Not Finish"].includes(
      readingStatus,
    ) ||
    !["Physical", "Ebook", "Audiobook"].includes(readingFormat) ||
    !Number.isInteger(personalRating) ||
    personalRating < 1 ||
    personalRating > 5 ||
    typeof isFavourite !== "boolean" ||
    !Number.isInteger(currentPage) ||
    currentPage < 1 ||
    !isDateString(dateAdded) ||
    !isDateString(readingStartDate, true) ||
    !isDateString(targetCompletionDate, true) ||
    typeof reviewTitle !== "string" ||
    typeof reviewText !== "string" ||
    reviewText.length > 500 ||
    typeof readingGoalEnabled !== "boolean" ||
    (dailyPageGoal !== null &&
      dailyPageGoal !== undefined &&
      (!Number.isInteger(dailyPageGoal) || dailyPageGoal < 1)) ||
    typeof favouriteQuote !== "string" ||
    favouriteQuote.length > 50 ||
    typeof privateNote !== "string" ||
    privateNote.length > 200
  ) {
    throw new HttpError(400, "One or more library fields are invalid.");
  }

  return {
    readingStatus,
    readingFormat,
    personalRating,
    isFavourite,
    currentPage,
    dateAdded,
    readingStartDate: readingStartDate || null,
    targetCompletionDate: targetCompletionDate || null,
    reviewTitle,
    reviewText,
    readingGoalEnabled,
    dailyPageGoal: dailyPageGoal ?? null,
    favouriteQuote,
    privateNote,
  };
}


async function getLibraryState(userId) {
  const [
    librarySnapshot,
    ownedCollectionsSnapshot,
    publicCollectionsSnapshot,
    savedCollectionRefs,
    likedCollectionRefs,
  ] = await Promise.all([
    db.collection("library").where("userId", "==", userId).get(),
    db.collection("collections").where("ownerId", "==", userId).get(),
    db.collection("collections").where("isPublic", "==", true).get(),
    db.collection("users").doc(userId).collection("savedCollections").get(),
    db.collection("users").doc(userId).collection("likedCollections").get(),
  ]);
  const savedCollectionSnapshots = await Promise.all(
    savedCollectionRefs.docs.map(({ id }) =>
      db.collection("collections").doc(id).get(),
    ),
  );
  const [collections, publicCollections, savedCollections] = await Promise.all([
    Promise.all(ownedCollectionsSnapshot.docs.map(serializeCollectionWithOwner)),
    Promise.all(publicCollectionsSnapshot.docs.map(serializeCollectionWithOwner)),
    Promise.all(
      savedCollectionSnapshots
        .filter((snapshot) => snapshot.exists && snapshot.get("isPublic") === true)
        .map(serializeCollectionWithOwnerProfile),
    ),
  ]);
  const likedCollectionIds = new Set(
    likedCollectionRefs.docs.map(({ id }) => id),
  );
  const includeLikeState = (collectionList) =>
    collectionList.map((collection) => ({
      ...collection,
      isLiked: likedCollectionIds.has(collection.id),
    }));
  const collectionIdsByBookId = new Map();
  for (const collection of collections) {
    for (const item of collection.items) {
      const collectionIds = collectionIdsByBookId.get(item.bookId) ?? [];
      collectionIds.push(collection.id);
      collectionIdsByBookId.set(item.bookId, collectionIds);
    }
  }
  const library = librarySnapshot.docs
    .map((libraryDoc) => {
      const entry = libraryDoc.data();
      return {
        ...entry,
        collectionIds: collectionIdsByBookId.get(entry.bookId) ?? [],
      };
    })
    .sort((left, right) =>
      String(right.dateAdded ?? "").localeCompare(String(left.dateAdded ?? "")),
    );

  return {
    library,
    collections: includeLikeState(collections),
    publicCollections: includeLikeState(publicCollections),
    savedCollections: includeLikeState(savedCollections),
  };
}

async function addToLibrary(userId, payload) {
  const {
    userId: requestedUserId,
    bookId,
    libraryFields: requestedLibraryFields,
    collectionIds,
    newCollection,
  } = payload ?? {};

  if (requestedUserId !== userId) {
    throw new HttpError(403, "The authenticated user does not match userId.");
  }
  if (
    typeof bookId !== "string" ||
    bookId.trim().length === 0 ||
    bookId.length > 500
  ) {
    throw new HttpError(400, "bookId must be a non-empty string.");
  }
  if (
    collectionIds !== undefined &&
    (!Array.isArray(collectionIds) ||
      collectionIds.length > 50 ||
      collectionIds.some((id) => typeof id !== "string" || id.length === 0))
  ) {
    throw new HttpError(
      400,
      "collectionIds must be an array of collection IDs.",
    );
  }
  if (
    newCollection !== undefined &&
    (!isRecord(newCollection) ||
      typeof newCollection.name !== "string" ||
      newCollection.name.trim().length < 5 ||
      newCollection.name.trim().length > 20 ||
      typeof newCollection.isPublic !== "boolean")
  ) {
    throw new HttpError(400, "New collection details are invalid.");
  }

  const libraryFields = normalizeLibraryFields(requestedLibraryFields);
  const collectionsRef = db.collection("collections");
  const newCollectionRef = newCollection ? collectionsRef.doc() : null;
  const newCollectionId = newCollectionRef?.id;
  const requestedCollectionIds = collectionIds ?? [];
  const hasCollectionSelection = Array.isArray(collectionIds);
  const selectedCollectionIds = new Set(requestedCollectionIds);
  if (newCollectionId) selectedCollectionIds.add(newCollectionId);

  const ownedCollectionsQuery = collectionsRef.where("ownerId", "==", userId);
  const libraryRef = db
    .collection("library")
    .doc(libraryDocumentId(userId, bookId));
  const bookItemId = collectionItemId(bookId);
  let persistedCollectionIds = [];

  await db.runTransaction(async (transaction) => {
    const librarySnapshot = await transaction.get(libraryRef);
    if (!hasCollectionSelection && !newCollection) {
      const collectionsSnapshot = await transaction.get(ownedCollectionsQuery);
      const existingMemberships = await Promise.all(
        collectionsSnapshot.docs.map(async (collectionDoc) => {
          const itemSnapshot = await transaction.get(
            collectionDoc.ref.collection("items").doc(bookItemId),
          );
          return itemSnapshot.exists ? collectionDoc.id : null;
        }),
      );
      persistedCollectionIds = existingMemberships.filter((id) => id !== null);
      transaction.set(
        libraryRef,
        {
          userId,
          bookId,
          ...libraryFields,
          updatedAt: FieldValue.serverTimestamp(),
          ...(librarySnapshot.exists
            ? {}
            : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );
      return;
    }

    const ownedCollectionsSnapshot = await transaction.get(
      ownedCollectionsQuery,
    );
    const ownedCollections = new Map(
      ownedCollectionsSnapshot.docs.map((collectionDoc) => [
        collectionDoc.id,
        collectionDoc,
      ]),
    );

    for (const id of requestedCollectionIds) {
      if (!ownedCollections.has(id)) {
        throw new HttpError(404, "A selected collection was not found.");
      }
    }

    const collectionEntries = [...ownedCollections.entries()].map(
      ([id, collectionDoc]) => ({
        id,
        ref: collectionDoc.ref,
        data: collectionDoc.data(),
        isNew: false,
      }),
    );
    if (newCollectionRef && newCollection) {
      collectionEntries.push({
        id: newCollectionRef.id,
        ref: newCollectionRef,
        data: {
          ownerId: userId,
          name: newCollection.name.trim(),
          description: "",
          coverImageUrl: "",
          isPublic: newCollection.isPublic,
          bookCount: 0,
          likeCount: 0,
        },
        isNew: true,
      });
    }

    const membershipEntries = [];
    for (const collection of collectionEntries) {
      const itemRef = collection.ref.collection("items").doc(bookItemId);
      const itemSnapshot = collection.isNew
        ? null
        : await transaction.get(itemRef);
      membershipEntries.push({
        ...collection,
        itemRef,
        itemExists: itemSnapshot?.exists === true,
        isSelected:
          selectedCollectionIds.has(collection.id) ||
          (!hasCollectionSelection && itemSnapshot?.exists === true),
      });
    }

    persistedCollectionIds = membershipEntries
      .filter((entry) => entry.isSelected)
      .map((entry) => entry.id);
    transaction.set(
      libraryRef,
      {
        userId,
        bookId,
        ...libraryFields,
        updatedAt: FieldValue.serverTimestamp(),
        ...(librarySnapshot.exists
          ? {}
          : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

    for (const entry of membershipEntries) {
      if (entry.isNew) {
        transaction.set(entry.ref, {
          ...entry.data,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          bookCount: entry.isSelected ? 1 : 0,
        });
      }

      if (entry.isSelected && !entry.itemExists) {
        transaction.set(entry.itemRef, {
          bookId,
          addedAt: FieldValue.serverTimestamp(),
          sortOrder: Number(entry.data.bookCount ?? 0),
        });
        if (!entry.isNew) {
          transaction.update(entry.ref, {
            bookCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      } else if (!entry.isSelected && entry.itemExists) {
        transaction.delete(entry.itemRef);
        transaction.update(entry.ref, {
          bookCount: Math.max(0, Number(entry.data.bookCount ?? 0) - 1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  });

  return {
    success: true,
    libraryId: libraryDocumentId(userId, bookId),
    createdCollection: newCollectionRef
      ? {
          id: newCollectionId,
          name: newCollection.name.trim(),
          isPublic: newCollection.isPublic,
        }
      : null,
    collectionIds: persistedCollectionIds,
  };
}

async function getLibrary(userId) {
  const [librarySnapshot, collectionsSnapshot] = await Promise.all([
    db.collection("library").where("userId", "==", userId).get(),
    db.collection("collections").where("ownerId", "==", userId).get(),
  ]);
  const collectionMemberships = new Map();
  await Promise.all(
    collectionsSnapshot.docs.map(async (collectionDoc) => {
      const itemsSnapshot = await collectionDoc.ref.collection("items").get();
      for (const itemDoc of itemsSnapshot.docs) {
        const bookId = itemDoc.get("bookId");
        if (typeof bookId !== "string") continue;
        const collectionIds = collectionMemberships.get(bookId) ?? [];
        collectionIds.push(collectionDoc.id);
        collectionMemberships.set(bookId, collectionIds);
      }
    }),
  );

  return librarySnapshot.docs
    .map((libraryDoc) => {
      const entry = libraryDoc.data();
      return {
        ...entry,
        collectionIds: collectionMemberships.get(entry.bookId) ?? [],
      };
    })
    .sort((left, right) =>
      String(right.dateAdded ?? "").localeCompare(String(left.dateAdded ?? "")),
    );
}

module.exports = {
  addToLibrary,
  getLibrary,
  getLibraryState,
};
