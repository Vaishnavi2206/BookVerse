import { useCallback, useEffect, useRef, useState } from "react";
import {
  Grid,
  type CellComponentProps,
  type GridImperativeAPI,
} from "react-window";
import { useNavigate } from "react-router-dom";
import "./BookList.css";
import Search from "../search/Search";
import {
  removeBookFromCollection,
  savePublicCollection,
  setCollectionLike,
} from "../../shared/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "react-toastify";
import {
  addSavedCollectionToState,
  removeBookFromCollectionState,
  updateCollectionLikeInState,
  useLibraryState,
  type LibraryListBook,
} from "../../shared/library-state";
import { Book, Collection, CollectionBook, BookView, ListTab, CollectionTab, BookResponse, BookGridCellProps, RequestCursor }
  from "../../types/book-types";

const DEFAULT_QUERY = "thriller";
const PAGE_SIZE = 10;
const CACHE_PREFIX = "bookList:";
const FAVOURITES_KEY = "bookFavourites";

function isBook(value: unknown): value is Book {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    typeof value.key === "string" &&
    "title" in value &&
    typeof value.title === "string"
  );
}

function toBook(libraryBook: LibraryListBook): Book {
  return {
    key: libraryBook.key ?? "",
    title: libraryBook.bookFields.title ?? "Untitled book",
    author_name: libraryBook.bookFields.author
      ? [libraryBook.bookFields.author]
      : "Unknown author",
  };
}

function CollectionBookCover({
  book,
  large = false,
}: {
  book: CollectionBook;
  large?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const workId = book.key?.match(/^\/works\/([^/]+)$/)?.[1];

  return (
    <span
      className={`book-collection-book-cover${large ? " is-large" : ""}`}
      aria-hidden="true"
    >
      {workId && !imageFailed ? (
        <img
          src={`https://covers.openlibrary.org/b/olid/${workId}-M.jpg`}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{book.title.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

function getCacheKey(query: string) {
  return `${CACHE_PREFIX}${query.trim().toLocaleLowerCase()}`;
}

function readCachedBooks(query: string): Book[] | null {
  const stored =
    localStorage.getItem(getCacheKey(query)) ??
    (query === DEFAULT_QUERY ? localStorage.getItem("bookList") : null);

  if (stored === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const books = parsed.filter(isBook);
    return books.length > 0 ? books : null;
  } catch {
    return null;
  }
}

function getFavouriteBooks(): Book[] {
    const stored = localStorage.getItem(FAVOURITES_KEY) ?? localStorage.getItem("bookList");
    if (stored === null) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed)
        ? parsed.filter(
            (value): value is Book =>
              isBook(value) && value.favourite === true,
          )
        : [];
    } catch {
      return [];
    }
}

function BookCard({
  book,
  coverHeight,
  onBookDetails,
}: {
  book: Book;
  coverHeight: number;
  onBookDetails: (book: Book) => void;
}) {
  return (
    <article className="book-item">
      <button
        type="button"
        className="book-detail-trigger"
        onClick={() => onBookDetails(book)}
        aria-label={`View details for ${book.title}`}
      >
        {book.cover_i ? (
          <img
            src={`https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`}
            alt=""
            className="book-cover"
            style={{ height: coverHeight }}
          />
        ) : (
          <span
            className="book-cover book-cover-placeholder"
            style={{ height: coverHeight }}
            aria-hidden="true"
          >
            {book.title.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="book-item-title">{book.title}</span>
        <span className="book-item-author">
          {book.author_name?.join(", ") ?? "Unknown author"}
        </span>
      </button>
    </article>
  );
}

function LoadMoreSentinel({
  root,
  onIntersect,
}: {
  root: HTMLElement | null;
  onIntersect: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onIntersect();
        }
      },
      { root },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onIntersect, root]);

  return (
    <div ref={sentinelRef} className="book-list-load-sentinel" aria-hidden="true">
      Loading more books...
    </div>
  );
}

function BookGridCell({
  columnIndex,
  rowIndex,
  style,
  books,
  columns,
  canLoadMore,
  scrollRoot,
  coverHeight,
  onLoadMore,
  onBookDetails,
}: CellComponentProps<BookGridCellProps>) {
  const bookIndex = rowIndex * columns + columnIndex;
  const book = books[bookIndex];

  return (
    <div className="book-list-cell" style={style}>
      {book ? (
        <BookCard
          book={book}
          coverHeight={coverHeight}
          onBookDetails={onBookDetails}
        />
      ) : canLoadMore && bookIndex === books.length ? (
        <LoadMoreSentinel root={scrollRoot} onIntersect={onLoadMore} />
      ) : null}
    </div>
  );
}

const BookList = ({
  category,
  scrollElement,
}: {
  category: string;
  scrollElement: HTMLElement | null;
}) => {
  const { uiUser } = useAuth();
  const libraryState = useLibraryState(uiUser?.userId);
  const libraryBooks = libraryState.books;
  const ownedCollections = libraryState.collections;
  const publicCollections = libraryState.publicCollections;
  const [initialBooks] = useState(() => readCachedBooks(DEFAULT_QUERY));
  const navigate = useNavigate();
  const [listTab, setListTab] = useState<ListTab>("books");
  const [bookView, setBookView] = useState<BookView>("all");
  const [collectionTab, setCollectionTab] = useState<CollectionTab>("mine");
  const [activeCollection, setActiveCollection] = useState<Collection | null>(
    null,
  );
  const [savingCollectionId, setSavingCollectionId] = useState<string | null>(
    null,
  );
  const [likingCollectionId, setLikingCollectionId] = useState<string | null>(
    null,
  );
  const [selectedCollectionBook, setSelectedCollectionBook] =
    useState<CollectionBook | null>(null);
  const [books, setBooks] = useState<Book[]>(initialBooks ?? []);
  const initialHasMore =
    initialBooks === null || initialBooks.length % PAGE_SIZE === 0;
  const [favouriteBooks] = useState<Book[]>(() => {
    return getFavouriteBooks();
  });
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState(5);
  const [gridHeight, setGridHeight] = useState(600);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const [headerElement, setHeaderElement] = useState<HTMLElement | null>(null);
  const gridRef = useRef<GridImperativeAPI>(null);
  const booksRef = useRef(books);
  const favouritesRef = useRef(favouriteBooks);
  const requestRef = useRef<RequestCursor>({
    query: DEFAULT_QUERY,
    nextPage: initialBooks
      ? Math.floor(initialBooks.length / PAGE_SIZE) + 1
      : 1,
    hasMore: initialHasMore,
    loading: false,
    requestId: 0,
  });

  const updateGridDimensions = useCallback(() => {
    if (!listElement || !scrollElement) {
      return;
    }

    const width = listElement.clientWidth;
    setColumns(Math.max(1, Math.floor(width / 205)));
    const availableHeight =
      scrollElement.clientHeight -
      (headerElement?.offsetHeight ?? 0) -
      48;
    setGridHeight(Math.max(2, availableHeight));
  }, [headerElement, listElement, scrollElement]);

  useEffect(() => {
    if (!listElement || !scrollElement) {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateGridDimensions();
    });
    observer.observe(listElement);
    observer.observe(scrollElement);
    if (headerElement) observer.observe(headerElement);
    return () => observer.disconnect();
  }, [headerElement, listElement, scrollElement, updateGridDimensions]);

  const setGridRef = useCallback((api: GridImperativeAPI | null) => {
    gridRef.current = api;
    setGridElement(api?.element ?? null);
  }, []);

  const loadNextPage = useCallback(async () => {
    const cursor = requestRef.current;
    if (cursor == null || cursor.loading || !cursor.hasMore) {
      return;
    }

    cursor.loading = true;
    const requestId = cursor.requestId;
    const page = cursor.nextPage;
    const requestedQuery = cursor.query;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(requestedQuery)}&page=${page}&limit=${PAGE_SIZE}`,
      );
      if (!response.ok) {
        throw new Error(`Book search failed (${response.status}).`);
      }

      const data: BookResponse = await response.json();
      if (requestRef.current.requestId !== requestId) {
        return;
      }

      const favouriteKeys = new Set(favouritesRef.current.map((book) => book.key));
      const results = (data.docs ?? [])
        .filter(isBook)
        .map((book) => ({ ...book, favourite: favouriteKeys.has(book.key) }));
      const nextBooks =
        page === 1 ? results : [...booksRef.current, ...results];
      booksRef.current = nextBooks;
      setBooks(nextBooks);

      try {
        const serializedBooks = JSON.stringify(nextBooks);
        localStorage.setItem(getCacheKey(requestedQuery), serializedBooks);
        if (requestedQuery === DEFAULT_QUERY) {
          localStorage.setItem("bookList", serializedBooks);
        }
      } catch (storageError) {
        setError(
          storageError instanceof Error
            ? `Books loaded, but could not be saved locally: ${storageError.message}`
            : "Books loaded, but could not be saved locally.",
        );
      }

      cursor.nextPage = page + 1;
      cursor.hasMore =
        results.length === PAGE_SIZE &&
        (data.numFound === undefined || page * PAGE_SIZE < data.numFound);
      setHasMore(cursor.hasMore);
    } catch (fetchError) {
      if (requestRef.current.requestId === requestId) {
        cursor.hasMore = false;
        setHasMore(false);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load books.",
        );
      }
    } finally {
      if (requestRef.current.requestId === requestId) {
        cursor.loading = false;
        setIsLoading(false);
      }
    }
  }, []);

  const handleSearch = useCallback(
    (searchQuery: string) => {
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery.length <= 3) {
        return false;
      }

      const cachedBooks = readCachedBooks(trimmedQuery);
      const cursor = requestRef.current;
      cursor.requestId += 1;
      cursor.query = trimmedQuery;
      cursor.nextPage = cachedBooks
        ? Math.floor(cachedBooks.length / PAGE_SIZE) + 1
        : 1;
      cursor.hasMore =
        cachedBooks === null || cachedBooks.length % PAGE_SIZE === 0;
      cursor.loading = false;

      const favouriteKeys = new Set(favouritesRef.current.map((book) => book.key));
      booksRef.current = (cachedBooks ?? []).map((book) => ({
        ...book,
        favourite: favouriteKeys.has(book.key),
      }));
      setBooks(booksRef.current);
      setHasMore(cursor.hasMore);
      setIsLoading(false);
      setError(null);
      scrollElement?.scrollTo({ top: 0 });
      return true;
    },
    [scrollElement],
  );

  const getBookDetails = (book: Book) => {
    navigate("/book-details", { state: { book } });
  };

  const handleRemoveFromCollection = async (
    collection: Collection,
    bookId: string,
  ) => {
    try {
      if (!uiUser?.userId) throw new Error("You must be signed in to edit collections.");
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
          bookIds: current.bookIds?.filter((_, index) => index !== removedIndex),
        };
      });
      if (cacheUpdated) toast.success(`Book removed from "${collection.name}".`);
      else toast.warning("Book removed from the collection, but the local cache could not be updated.");
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
    const libraryBook = libraryBooks.find(
      (book) =>
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

  const openCollection = (
    collection: Collection,
    book?: CollectionBook,
  ) => {
    setActiveCollection(collection);
    setSelectedCollectionBook(book ?? null);
  };

  const closeCollection = () => {
    setActiveCollection(null);
    setSelectedCollectionBook(null);
  };

  const isFavourites = category === "Favourites";
  const savedCollectionIds = new Set(
    libraryState.savedCollections.map((collection) => collection.id),
  );
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
  const ownedCollectionIds = new Set(userCollections.map((collection) => collection.id));
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
        const libraryBook = libraryBooks.find((book) => book.key === item.bookId);
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
        const libraryBook = libraryBooks.find((book) => book.key === item.bookId);
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
  const baseBooks = isFavourites ? favouriteBooks : books;
  const visibleBooks =
    listTab === "books"
      ? bookView === "all"
        ? baseBooks
        : isFavourites
          ? collectionBooks.filter((book) =>
              favouriteBooks.some((favourite) => favourite.key === book.key),
            )
          : collectionBooks
      : [];
  const canLoadMore =
    listTab === "books" && bookView === "all" && !isFavourites && hasMore;
  const rowCount = Math.max(
    1,
    Math.ceil((visibleBooks.length + (canLoadMore ? 1 : 0)) / columns),
  );

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

  const cellProps: BookGridCellProps = {
    books: visibleBooks,
    columns,
    canLoadMore,
    scrollRoot: gridElement,
    coverHeight: Math.max(90, Math.min(270, Math.floor(gridHeight / 2) - 100)),
    onLoadMore: loadNextPage,
    onBookDetails: getBookDetails,
  };
  const showingCollections = listTab === "collections";
  const pageTitle = showingCollections
    ? "Collections"
    : isFavourites
      ? "Your favourites"
      : "Discover books";
  const displayedCollections =
    collectionTab === "mine"
      ? userCollections
      : collectionTab === "saved"
        ? savedCollectionCards
        : browseCollections;
  const displayedCollectionCount = displayedCollections.length;

  const renderCollectionCard = (collection: Collection) => (
    <article className="book-collection-card" key={collection.id}>
      {collection.showOwnerProfile && (
        <div className="book-collection-owner">
          <span className="book-collection-owner-photo" aria-hidden="true">
            <span>
              {(collection.ownerName || "R").charAt(0).toUpperCase()}
            </span>
            {collection.ownerPhotoUrl && (
              <img
                src={collection.ownerPhotoUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            )}
          </span>
          <span className="book-collection-owner-details">
            <strong>{collection.ownerName || "Book Verse reader"}</strong>
            <small>Saved collection</small>
          </span>
        </div>
      )}
      <div className="book-collection-card-top">
        <span className="book-collection-icon" aria-hidden="true">
          ▤
        </span>
        {collection.isPublic && (
          <button
            type="button"
            className={`book-collection-like${collection.isLiked ? " is-liked" : ""}`}
            onClick={() => void likeCollection(collection)}
            disabled={likingCollectionId === collection.id}
            aria-pressed={collection.isLiked === true}
            aria-label={`${collection.isLiked ? "Unlike" : "Like"} ${collection.name}. ${collection.likeCount ?? 0} likes`}
          >
            <span aria-hidden="true">
              {collection.isLiked ? "♥" : "♡"}
            </span>
            <span>{collection.likeCount ?? 0}</span>
          </button>
        )}
        <span className={`book-collection-visibility${collection.isPublic ? " is-public" : ""}`}>
          {collection.isPublic ? "Public" : "Private"}
        </span>
      </div>
      <h2>{collection.name}</h2>
      <p>{collection.description}</p>
      <div className="book-collection-meta">
        {!collection.showOwnerProfile && <span>By {collection.owner}</span>}
        <span>
          {collection.bookTitles.length}{" "}
          {collection.bookTitles.length === 1 ? "book" : "books"}
        </span>
      </div>
      {collection.isSample && <span className="book-collection-sample">Sample</span>}
      {collection.bookTitles.length > 0 && (
        <div
          className="book-collection-preview"
          aria-label={`Featured books in ${collection.name}`}
        >
          {collection.bookTitles.slice(0, 3).map((title, index) => {
            const book = getCollectionBook(collection, index);
            return (
              <button
                type="button"
                className="book-collection-preview-book"
                key={collection.bookIds?.[index] ?? `${title}-${index}`}
                onClick={() => openCollection(collection, book)}
              >
                <CollectionBookCover book={book} />
                <span className="book-collection-preview-copy">
                  <span>{book.title}</span>
                  <small>{book.author}</small>
                </span>
              </button>
            );
          })}
          {collection.bookTitles.length > 3 && (
            <span className="book-collection-preview-more">
              +{collection.bookTitles.length - 3} more
            </span>
          )}
        </div>
      )}
      <div className="book-collection-actions">
        <button
          type="button"
          className="book-collection-expand"
          onClick={() => openCollection(collection)}
        >
          {collection.bookTitles.length > 0 ? "Browse books" : "View collection"}
        </button>
        {collection.canSave && (
          <button
            type="button"
            className="book-collection-expand book-collection-save"
            onClick={() => void saveCollection(collection)}
            disabled={
              collection.isSaved || savingCollectionId === collection.id
            }
          >
            {collection.isSaved
              ? "Saved"
              : savingCollectionId === collection.id
                ? "Saving..."
                : "Save"}
          </button>
        )}
      </div>
    </article>
  );

  return (
    <section className="book-list-page" aria-labelledby="book-list-title">
      <header ref={setHeaderElement} className="book-list-header">
        <div>
          <span className="book-list-eyebrow">
            {showingCollections
              ? collectionTab === "mine"
                ? "YOUR READING BOARDS"
                : collectionTab === "saved"
                  ? "YOUR SAVED COLLECTIONS"
                  : "COMMUNITY COLLECTIONS"
              : isFavourites
                ? "YOUR SAVED PICKS"
                : "FIND YOUR NEXT READ"}
          </span>
          <h1 id="book-list-title">{pageTitle}</h1>
          <p>
            {showingCollections
              ? collectionTab === "mine"
                ? "Organize your books and manage collection visibility."
                : collectionTab === "saved"
                  ? "Collections you saved from the community."
                  : "Explore public collections shared by readers."
              : isFavourites
                ? "A collection of books you’ve loved."
                : "Explore stories, authors, and new worlds."}
          </p>
        </div>
        {!showingCollections && (
          <div className="book-list-search">
            <Search handleSearch={handleSearch} />
          </div>
        )}
        <div
          className="book-list-total"
          aria-label={
            showingCollections
              ? `${displayedCollectionCount} collections`
              : `${visibleBooks.length} books`
          }
        >
          <span>
            {showingCollections
              ? displayedCollectionCount
              : visibleBooks.length}
          </span>
          <span>
            {showingCollections
              ? displayedCollectionCount === 1
                ? "collection"
                : "collections"
              : visibleBooks.length === 1
                ? "book"
                : "books"}
          </span>
        </div>
        <div className="book-list-view-controls">
          <div className="book-list-tabs" role="tablist" aria-label="Books and collections">
            {(["books", "collections"] as const).map((tab) => (
              <button
                key={tab}
                id={`${tab}-tab`}
                type="button"
                role="tab"
                aria-selected={listTab === tab}
                aria-controls="book-list-content"
                className={`book-list-tab${listTab === tab ? " is-active" : ""}`}
                onClick={() => setListTab(tab)}
              >
                {tab === "books" ? "Books" : "Collections"}
              </button>
            ))}
          </div>
          {showingCollections ? (
            <div className="book-list-filters" aria-label="Collection views">
              {(["mine", "saved", "browse"] as const).map((tab) => (
                <button
                  type="button"
                  key={tab}
                  className={collectionTab === tab ? "is-active" : ""}
                  aria-pressed={collectionTab === tab}
                  onClick={() => setCollectionTab(tab)}
                >
                  {tab === "mine"
                    ? "My collections"
                    : tab === "saved"
                      ? "Saved Collections"
                      : "Browse all"}
                </button>
              ))}
            </div>
          ) : (
            <div className="book-list-filters" aria-label="Filter books">
              {(["all", "private", "public"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  className={bookView === view ? "is-active" : ""}
                  aria-pressed={bookView === view}
                  onClick={() => setBookView(view)}
                >
                  {view === "all"
                    ? "All books"
                    : view === "private"
                      ? "Private collections"
                      : "Public collections"}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {showingCollections ? (
        libraryState.loading ? (
          <div className="book-list-empty" id="book-list-content" role="status">
            <p>Loading collections...</p>
          </div>
        ) : libraryState.error ? (
          <div
            className="book-list-empty"
            id="book-list-content"
            role="alert"
            aria-labelledby="collections-load-error"
          >
            <h2 id="collections-load-error">Unable to load collections</h2>
            <p>{libraryState.error}</p>
          </div>
        ) : collectionTab === "mine" ? (
          displayedCollections.length > 0 ? (
            <div
              className="book-collections-grid"
              id="book-list-content"
              role="tabpanel"
              aria-labelledby="collections-tab"
            >
              {displayedCollections.map(renderCollectionCard)}
            </div>
          ) : (
            <div
              className="book-list-empty"
              id="book-list-content"
              role="tabpanel"
              aria-labelledby="collections-tab"
            >
              <span aria-hidden="true">▤</span>
              <h2>No collections yet</h2>
              <p>Create a collection while adding a book to your library.</p>
            </div>
          )
        ) : collectionTab === "saved" ? (
          <div
            className="book-collection-library"
            id="book-list-content"
            role="tabpanel"
            aria-labelledby="collections-tab"
          >
            <section
              className="book-collection-folder"
              aria-labelledby="saved-collections-title"
            >
              <div className="book-collection-folder-header">
                <span className="book-collection-folder-icon" aria-hidden="true">
                  ▤
                </span>
                <h2 id="saved-collections-title">Saved Collections</h2>
                <span className="book-collection-folder-count">
                  {savedCollectionCards.length}
                </span>
              </div>
              {savedCollectionCards.length > 0 ? (
                <div className="book-collections-grid">
                  {savedCollectionCards.map(renderCollectionCard)}
                </div>
              ) : (
                <p className="book-collection-folder-empty">
                  Collections you save from Browse all will appear here.
                </p>
              )}
            </section>
          </div>
        ) : displayedCollections.length > 0 ? (
          <div
            className="book-collections-grid"
            id="book-list-content"
            role="tabpanel"
            aria-labelledby="collections-tab"
          >
            {displayedCollections.map(renderCollectionCard)}
          </div>
        ) : (
          <div
            className="book-list-empty"
            id="book-list-content"
            role="tabpanel"
            aria-labelledby="collections-tab"
          >
            <span aria-hidden="true">▤</span>
            <h2>No public collections yet</h2>
            <p>Public collections will appear here when available.</p>
          </div>
        )
      ) : visibleBooks.length > 0 || canLoadMore ? (
        <div
          ref={setListElement}
          className="book-list-window"
          id="book-list-content"
          role="tabpanel"
          aria-labelledby="books-tab"
          aria-label="Books"
        >
          {listElement && (
            <Grid
              gridRef={setGridRef}
              className="book-list-grid"
              cellComponent={BookGridCell}
              cellProps={cellProps}
              columnCount={columns}
              columnWidth={`${100 / columns}%`}
              rowCount={rowCount}
              rowHeight={Math.floor(gridHeight / 2)}
              overscanCount={1}
              style={{
                width: "100%",
                height: gridHeight,
                overflow: "auto",
              }}
            />
          )}
        </div>
      ) : (
        <div
          className="book-list-empty"
          id="book-list-content"
          role="tabpanel"
          aria-labelledby="books-tab"
        >
          <span aria-hidden="true">♡</span>
          <h2>
            {bookView !== "all"
              ? `No books in ${bookView} collections`
              : isFavourites
                ? "No favourites yet"
                : "No books to show"}
          </h2>
          <p>
            {bookView !== "all"
              ? "Add books to a collection with this visibility from the book details form."
              : isFavourites
                ? "Tap the heart on a book to save it here."
                : "Try searching for a title, author, or subject."}
          </p>
        </div>
      )}

      {listTab === "books" && isLoading && (
        <p className="book-list-loading" role="status">
          Loading books...
        </p>
      )}
      {listTab === "books" && error && (
        <div className="book-list-load-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              requestRef.current.hasMore = true;
              setHasMore(true);
              setError(null);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/*
        {selectedBook && (
          <LibraryForm
            book={selectedBook}
            onClose={() => {
              setSelectedBook(null);
            }}
          />
        )}
      */}
      {activeCollection && (
        <div
          className="book-collection-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeCollection();
          }}
        >
          <section
            className="book-collection-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-collection-dialog-title"
          >
            <header className="book-collection-dialog-header">
              <div>
                <span>COLLECTION</span>
                <h2 id="book-collection-dialog-title">
                  {activeCollection.name}
                </h2>
              </div>
              <button
                type="button"
                className="book-collection-dialog-close"
                onClick={closeCollection}
                aria-label="Close collection"
              >
                ×
              </button>
            </header>
            {selectedCollectionBook ? (
              <div className="book-collection-book-details">
                <button
                  type="button"
                  className="book-collection-back"
                  onClick={() => setSelectedCollectionBook(null)}
                >
                  ← All books
                </button>
                <div className="book-collection-book-detail-content">
                  <CollectionBookCover
                    book={selectedCollectionBook}
                    large
                  />
                  <div>
                    <h3>{selectedCollectionBook.title}</h3>
                    <p>{selectedCollectionBook.author}</p>
                    {selectedCollectionBook.firstPublished && (
                      <span>
                        First published {selectedCollectionBook.firstPublished}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="book-collection-dialog-summary">
                  {activeCollection.description}
                </p>
                <div
                  className="book-collection-dialog-books"
                  aria-label={`Books in ${activeCollection.name}`}
                >
                  {activeCollection.bookTitles.map((title, index) => {
                    const book = getCollectionBook(activeCollection, index);
                    const bookId = activeCollection.bookIds?.[index];
                    return (
                      <div
                        className="book-collection-dialog-book"
                        key={bookId ?? title}
                      >
                        <button
                          type="button"
                          className="book-collection-dialog-book-open"
                          onClick={() => setSelectedCollectionBook(book)}
                        >
                          <CollectionBookCover book={book} />
                          <span className="book-collection-preview-copy">
                            <span>{book.title}</span>
                            <small>{book.author}</small>
                          </span>
                        </button>
                        {activeCollection.canManage && bookId && (
                          <button
                            type="button"
                            className="book-collection-remove"
                            aria-label={`Remove ${book.title} from ${activeCollection.name}`}
                            onClick={() =>
                              void handleRemoveFromCollection(
                                activeCollection,
                                bookId,
                              )
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {activeCollection.bookTitles.length === 0 && (
                    <p className="book-collection-no-books">
                      This collection has no books yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
};

export default BookList;
