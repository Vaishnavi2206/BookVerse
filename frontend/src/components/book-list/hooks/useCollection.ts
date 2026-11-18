import {
  addSavedCollectionToState,
  removeBookFromCollectionState,
  updateCollectionLikeInState,
} from "../../../shared/library-state";
import { useState } from "react";
import { toast } from "react-toastify";
import { useLibraryState } from "../../../shared/library-state";
import { useAuth } from "../../../context/AuthContext";
import type { AuthUser } from "../../../context/AuthContext";
import { toBook } from "../book-list.utlis";
import type { Collection, CollectionBook } from "../book-types";
import {
  removeBookFromCollection,
  savePublicCollection,
  setCollectionLike,
} from "../../../shared/api";

export function useCollection() {
  const { uiUser } = useAuth();
  const libraryState = useLibraryState(uiUser?.userId);
  const libraryBooks = libraryState.books;
  const ownedCollections = libraryState.collections;
  const publicCollections = libraryState.publicCollections;
  const [activeCollection, setActiveCollection] = useState<Collection | null>(
    null,
  );
  const [selectedCollectionBook, setSelectedCollectionBook] =
    useState<CollectionBook | null>(null);
  const [savingCollectionId, setSavingCollectionId] = useState<string | null>(
    null,
  );
  const [likingCollectionId, setLikingCollectionId] = useState<string | null>(
    null,
  );
  const savedCollectionIds = new Set(
    libraryState.savedCollections.map((collection) => collection.id),
  );
  const bookView = "private";


  const userCollections: Collection[] = ownedCollections.map((collection) => ({
    id: collection.id,
    ownerId: collection.ownerId,
    ownerName: collection.ownerName,
    ownerPhotoUrl: collection.ownerPhotoUrl,
    likeCount: collection.likeCount,
    isLiked: collection.isLiked,
    name: collection.name,
    description: collection.description,
    owner: "You",
    isPublic: collection.isPublic,
    canManage: true,
    bookTitles: collection.items.map((item) => {
      const libraryBook = libraryBooks.find((book) => book.key === item.bookId);
      return libraryBook?.bookFields.title ?? item.bookId;
    }),
    bookIds: collection.items.map((item) => item.bookId),
  }));
  const ownedCollectionIds = new Set(
    userCollections.map((collection) => collection.id),
  );
  const sharedCollections: Collection[] = publicCollections
    .filter((collection) => !ownedCollectionIds.has(collection.id))
    .map((collection) => ({
      id: collection.id,
      ownerId: collection.ownerId,
      ownerName: collection.ownerName,
      ownerPhotoUrl: collection.ownerPhotoUrl,
      likeCount: collection.likeCount,
      isLiked: collection.isLiked,
      name: collection.name,
      description: collection.description,
      owner: "Book Verse reader",
      isPublic: true,
      canSave: collection.ownerId !== uiUser?.userId,
      isSaved: savedCollectionIds.has(collection.id),
      bookTitles: collection.items.map((item) => {
        const libraryBook = libraryBooks.find(
          (book) => book.key === item.bookId,
        );
        return libraryBook?.bookFields.title ?? item.bookId;
      }),
      bookIds: collection.items.map((item) => item.bookId),
      canManage: false,
    }));
  const browseCollections = [
    ...userCollections.filter((collection) => collection.isPublic),
    ...sharedCollections,
  ];
  const savedCollectionCards: Collection[] = libraryState.savedCollections.map(
    (collection) => ({
      id: collection.id,
      ownerId: collection.ownerId,
      ownerName: collection.ownerName,
      ownerPhotoUrl: collection.ownerPhotoUrl,
      likeCount: collection.likeCount,
      isLiked: collection.isLiked,
      name: collection.name,
      description: collection.description,
      owner: collection.ownerName || "Book Verse reader",
      isPublic: collection.isPublic,
      bookTitles: collection.items.map((item) => {
        const libraryBook = libraryBooks.find(
          (book) => book.key === item.bookId,
        );
        return libraryBook?.bookFields.title ?? item.bookId;
      }),
      bookIds: collection.items.map((item) => item.bookId),
      isSaved: true,
      showOwnerProfile: true,
    }),
  );
  const visibleCollectionIds = new Set(
    ownedCollections
      .filter((collection) =>
        bookView === "private" ? !collection.isPublic : collection.isPublic,
      )
      .map((collection) => collection.id),
  );
  const collectionBooks = libraryBooks
    .filter((book) => {
      if (book.collectionIds) {
        return book.collectionIds.some((id) => visibleCollectionIds.has(id));
      }
      return book.collectionName
        ? bookView === "private"
          ? book.collectionIsPublic !== true
          : book.collectionIsPublic === true
        : false;
    })
    .map(toBook)
    .filter((book) => book.key);

  const handleRemoveFromCollection = async (
    collection: Collection,
    bookId: string,
    uiUser: AuthUser | null,
  ) => {
    try {
      if (!uiUser?.userId)
        throw new Error("You must be signed in to edit collections.");
      await removeBookFromCollection(collection.id, bookId);
      const cacheUpdated = await removeBookFromCollectionState(
        uiUser.userId,
        collection.id,
        bookId,
      );
      setActiveCollection((current) => {
        if (current?.id !== collection.id) return current;
        const removedIndex = current.bookIds?.indexOf(bookId) ?? -1;
        if (removedIndex < 0) return current;
        return {
          ...current,
          bookTitles: current.bookTitles.filter(
            (_, index) => index !== removedIndex,
          ),
          bookIds: current.bookIds?.filter(
            (_, index) => index !== removedIndex,
          ),
        };
      });
      if (cacheUpdated)
        toast.success(`Book removed from "${collection.name}".`);
      else
        toast.warning(
          "Book removed from the collection, but the local cache could not be updated.",
        );
    } catch (collectionError) {
      toast.error(
        collectionError instanceof Error
          ? `Unable to remove book from collection: ${collectionError.message}`
          : "Unable to remove book from collection.",
      );
    }
  };

  const getCollectionBook = (
    collection: Collection,
    index: number,
  ): CollectionBook => {
    const bookId = collection.bookIds?.[index];
    const libraryBook = libraryBooks.find((book) =>
      bookId
        ? book.key === bookId
        : book.bookFields.title?.trim().toLocaleLowerCase() ===
          collection.bookTitles[index].trim().toLocaleLowerCase(),
    );

    return {
      key: bookId ?? libraryBook?.key,
      title:
        libraryBook?.bookFields.title?.trim() ||
        collection.bookTitles[index] ||
        "Untitled book",
      author: libraryBook?.bookFields.author?.trim() || "Unknown author",
      firstPublished: libraryBook?.bookFields.firstPublished,
    };
  };

  const openCollection = (collection: Collection, book?: CollectionBook) => {
    setActiveCollection(collection);
    setSelectedCollectionBook(book ?? null);
  };

  const closeCollection = () => {
    setActiveCollection(null);
    setSelectedCollectionBook(null);
  };

  const saveCollection = async (collection: Collection) => {
    if (!uiUser?.userId || !collection.canSave || collection.isSaved) return;

    setSavingCollectionId(collection.id);
    try {
      const response = await savePublicCollection(collection.id);
      addSavedCollectionToState(uiUser.userId, response.collection);
      toast.success(`Saved "${collection.name}" to Saved Collections.`);
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? `Unable to save collection: ${saveError.message}`
          : "Unable to save collection.",
      );
    } finally {
      setSavingCollectionId(null);
    }
  };

  const likeCollection = async (collection: Collection) => {
    if (!uiUser?.userId || likingCollectionId === collection.id) return;

    const liked = collection.isLiked !== true;
    setLikingCollectionId(collection.id);
    try {
      const response = await setCollectionLike(collection.id, liked);
      updateCollectionLikeInState(
        uiUser.userId,
        collection.id,
        response.liked,
        response.likeCount,
      );
    } catch (likeError) {
      toast.error(
        likeError instanceof Error
          ? `Unable to update collection like: ${likeError.message}`
          : "Unable to update collection like.",
      );
    } finally {
      setLikingCollectionId(null);
    }
  };

  return {
    activeCollection,
    setSelectedCollectionBook,
    handleRemoveFromCollection,
    getCollectionBook,
    openCollection,
    closeCollection,
    saveCollection,
    likeCollection,
    savingCollectionId,
    likingCollectionId,
    collectionBooks,
    browseCollections,
    savedCollectionCards,
    userCollections,
    selectedCollectionBook
  };
}
