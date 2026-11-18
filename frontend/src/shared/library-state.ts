import { useEffect, useSyncExternalStore } from "react";
import type { LibraryBook } from "../types/form-types";
import type { UserCollection } from "./api";
import {
  getCachedLibraryBook,
  deleteCachedLibraryBook,
  putCachedLibraryBook,
} from "./library-cache-db";
import { restoreLibraryFromFirestore } from "./library-storage";

export type LibraryListBook = Pick<
  LibraryBook,
  | "key"
  | "libraryStatus"
  | "collectionName"
  | "collectionIsPublic"
  | "collectionIds"
  | "collectionNames"
  | "collectionVisibility"
  | "bookFields"
  | "currentPage"
  | "readingFormat"
  | "personalRating"
  | "favourite"
  | "dateAdded"
>;

export type LibraryState = {
  userId: string | null;
  books: LibraryListBook[];
  collections: UserCollection[];
  publicCollections: UserCollection[];
  savedCollections: UserCollection[];
  loading: boolean;
  error: string | null;
};

const emptyState: LibraryState = {
  userId: null,
  books: [],
  collections: [],
  publicCollections: [],
  savedCollections: [],
  loading: false,
  error: null,
};

let state = emptyState;
let loadingUserId: string | null = null;
const listeners = new Set<() => void>();

function publish(nextState: LibraryState) {
  state = nextState;
  listeners.forEach((listener) => listener());
}

function summarize(book: LibraryBook): LibraryListBook {
  return {
    key: book.key,
    libraryStatus: book.libraryStatus,
    collectionName: book.collectionName,
    collectionIsPublic: book.collectionIsPublic,
    collectionIds: book.collectionIds,
    collectionNames: book.collectionNames,
    collectionVisibility: book.collectionVisibility,
    bookFields: {
      title: book.bookFields.title,
      author: book.bookFields.author,
      firstPublished: book.bookFields.firstPublished,
    },
    currentPage: book.currentPage,
    readingFormat: book.readingFormat,
    personalRating: book.personalRating,
    favourite: book.favourite,
    dateAdded: book.dateAdded,
  };
}

async function loadLibrary(userId: string) {
  if (loadingUserId === userId || state.userId !== userId || !state.loading) return;
  loadingUserId = userId;

  try {
    const restored = await restoreLibraryFromFirestore(userId);
    if (state.userId !== userId) return;

    await Promise.all(
      restored.books.map((book) =>
        putCachedLibraryBook(userId, book).catch((error: unknown) => {
          console.error(
            `Unable to cache restored book details for ${book.key}.`,
            error,
          );
        }),
      ),
    );
    publish({
      userId,
      books: restored.books.map(summarize),
      collections: restored.collections,
      publicCollections: restored.publicCollections,
      savedCollections: restored.savedCollections,
      loading: false,
      error: null,
    });
  } catch (error) {
    if (state.userId !== userId) return;
    publish({
      ...state,
      loading: false,
      error:
        error instanceof Error ? error.message : "Unable to load your library.",
    });
  } finally {
    if (loadingUserId === userId) loadingUserId = null;
  }
}

export function subscribeLibraryState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibraryStateSnapshot() {
  return state;
}

export function addSavedCollectionToState(
  userId: string,
  collection: UserCollection,
) {
  if (state.userId !== userId) return;
  if (state.savedCollections.some(({ id }) => id === collection.id)) return;
  const existingCollection = state.publicCollections.find(
    ({ id }) => id === collection.id,
  );
  publish({
    ...state,
    savedCollections: [
      ...state.savedCollections,
      {
        ...collection,
        isLiked: existingCollection?.isLiked ?? collection.isLiked ?? false,
        likeCount: existingCollection?.likeCount ?? collection.likeCount,
      },
    ],
  });
}

export function updateCollectionLikeInState(
  userId: string,
  collectionId: string,
  isLiked: boolean,
  likeCount: number,
) {
  if (state.userId !== userId) return;
  const updateLike = (collection: UserCollection) =>
    collection.id === collectionId
      ? { ...collection, isLiked, likeCount }
      : collection;
  publish({
    ...state,
    collections: state.collections.map(updateLike),
    publicCollections: state.publicCollections.map(updateLike),
    savedCollections: state.savedCollections.map(updateLike),
  });
}

export function useLibraryState(userId: string | undefined) {
  const current = useSyncExternalStore(
    subscribeLibraryState,
    getLibraryStateSnapshot,
    getLibraryStateSnapshot,
  );

  useEffect(() => {
    if (!userId) {
      if (state.userId !== null) {
        loadingUserId = null;
        publish(emptyState);
      }
      return;
    }

    if (state.userId !== userId) {
      loadingUserId = null;
      publish({
        ...emptyState,
        userId,
        loading: true,
      });
      void loadLibrary(userId);
      return;
    }

  }, [userId]);

  if (!userId) return emptyState;
  return current.userId === userId
    ? current
    : { ...emptyState, userId, loading: true };
}

export async function saveLibraryBookToState(
  userId: string,
  book: LibraryBook,
  selectedCollectionIds: string[],
  newCollection?: { id: string; name: string; isPublic: boolean },
): Promise<boolean> {
  const updatedBook: LibraryBook = {
    ...book,
    collectionIds: selectedCollectionIds,
    collectionNames: [],
    collectionVisibility: {},
  };
  let updatedCollections = state.collections.map((collection) => {
    const shouldContainBook = selectedCollectionIds.includes(collection.id);
    const alreadyContainsBook = collection.items.some(
      (item) => item.bookId === book.key,
    );
    const items =
      shouldContainBook && !alreadyContainsBook
        ? [
            ...collection.items,
            {
              bookId: book.key ?? "",
              addedAt: new Date().toISOString(),
              sortOrder: collection.bookCount,
            },
          ]
        : !shouldContainBook && alreadyContainsBook
          ? collection.items.filter((item) => item.bookId !== book.key)
          : collection.items;
    return {
      ...collection,
      items,
      bookCount: items.length,
      updatedAt: new Date().toISOString(),
    };
  });

  if (newCollection && !updatedCollections.some(({ id }) => id === newCollection.id)) {
    updatedCollections = [
      ...updatedCollections,
      {
        ...newCollection,
        description: "",
        coverImageUrl: "",
        likeCount: 0,
        bookCount: 1,
        updatedAt: new Date().toISOString(),
        items: [
          {
            bookId: book.key ?? "",
            addedAt: new Date().toISOString(),
            sortOrder: 0,
          },
        ],
      },
    ];
  }

  const selectedCollections = updatedCollections.filter((collection) =>
    selectedCollectionIds.includes(collection.id),
  );
  updatedBook.collectionNames = selectedCollections.map(({ name }) => name);
  updatedBook.collectionVisibility = Object.fromEntries(
    selectedCollections.map(({ id, isPublic }) => [id, isPublic]),
  );
  updatedBook.collectionName = selectedCollections[0]?.name ?? "";
  updatedBook.collectionIsPublic = selectedCollections[0]?.isPublic ?? false;

  publish({
    ...state,
    books: [
      ...state.books.filter(({ key }) => key !== book.key),
      summarize(updatedBook),
    ],
    collections: updatedCollections,
    publicCollections: state.publicCollections.map((collection) => {
      const updated = updatedCollections.find(({ id }) => id === collection.id);
      return updated ?? collection;
    }).concat(
      newCollection?.isPublic &&
        !state.publicCollections.some(({ id }) => id === newCollection.id)
        ? [updatedCollections.find(({ id }) => id === newCollection.id)!]
        : [],
    ),
  });

  try {
    await putCachedLibraryBook(userId, updatedBook);
    return true;
  } catch (error) {
    console.error("Library saved, but its local detail cache could not be updated.", error);
    return false;
  }
}

export async function removeBookFromLibraryState(
  userId: string,
  bookId: string,
) {
  publish({
    ...state,
    books: state.books.filter((book) => book.key !== bookId),
  });
  try {
    await deleteCachedLibraryBook(userId, bookId);
  } catch (error) {
    console.error("Library entry removed from the current view, but cache cleanup failed.", error);
    throw error;
  }
}

export async function removeBookFromCollectionState(
  userId: string,
  collectionId: string,
  bookId: string,
): Promise<boolean> {
  const updatedCollections = state.collections.map((collection) =>
    collection.id === collectionId
      ? {
          ...collection,
          items: collection.items.filter((item) => item.bookId !== bookId),
          bookCount: Math.max(0, collection.bookCount - 1),
        }
      : collection,
  );
  const updatedBooks = state.books.map((book) => {
    if (book.key !== bookId) return book;
    const collectionIds = (book.collectionIds ?? []).filter(
      (id) => id !== collectionId,
    );
    const memberCollections = updatedCollections.filter((collection) =>
      collectionIds.includes(collection.id),
    );
    return {
      ...book,
      collectionIds,
      collectionNames: memberCollections.map(({ name }) => name),
      collectionVisibility: Object.fromEntries(
        memberCollections.map(({ id, isPublic }) => [id, isPublic]),
      ),
      collectionName: memberCollections[0]?.name ?? "",
      collectionIsPublic: memberCollections[0]?.isPublic ?? false,
    };
  });
  publish({
    ...state,
    books: updatedBooks,
    collections: updatedCollections,
    publicCollections: state.publicCollections.map(
      (collection) =>
        updatedCollections.find(({ id }) => id === collection.id) ?? collection,
    ),
  });

  const cachedBook = updatedBooks.find((book) => book.key === bookId);
  if (!cachedBook) return true;
  try {
    const fullBook = await getCachedLibraryBook(userId, bookId);
    if (fullBook) {
      await putCachedLibraryBook(userId, {
        ...fullBook,
        collectionIds: cachedBook.collectionIds,
        collectionNames: cachedBook.collectionNames,
        collectionVisibility: cachedBook.collectionVisibility,
        collectionName: cachedBook.collectionName,
        collectionIsPublic: cachedBook.collectionIsPublic,
      });
    }
    return true;
  } catch (error) {
    console.error("Collection changed, but the local detail cache could not be updated.", error);
    return false;
  }
}
