import { useCallback, useEffect, useRef, useState } from "react";
import {
  Grid,
  type GridImperativeAPI,
} from "react-window";
import { useNavigate } from "react-router-dom";
import "./BookList.css";
import Search from "../search/Search";
import { useAuth } from "../../context/AuthContext";
import {
  useLibraryState
} from "../../shared/library-state";
import type { Book, BookView, ListTab, CollectionTab, BookResponse, BookGridCellProps, RequestCursor }
  from "./book-types";
import {isBook, getCacheKey, readCachedBooks, getFavouriteBooks, DEFAULT_QUERY}
from "./book-list.utlis";
import BookGridCell from "./components/BookGrid";
import CollectionCard from "./components/CollectionCard";
import { useCollection } from './hooks/useCollection';
import CollectionList from './components/CollectionList';

const PAGE_SIZE = 10;

const BookList = ({
  category,
  scrollElement,
}: {
  category: string;
  scrollElement: HTMLElement | null;
}) => {
  const { uiUser } = useAuth();
  const libraryState = useLibraryState(uiUser?.userId);
  const [initialBooks] = useState(() => readCachedBooks(DEFAULT_QUERY));
  const navigate = useNavigate();
  const [listTab, setListTab] = useState<ListTab>("books");
  const [bookView, setBookView] = useState<BookView>("all");
  const [collectionTab, setCollectionTab] = useState<CollectionTab>("mine");

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
  const {
    activeCollection,
    collectionBooks,
    browseCollections,
    savedCollectionCards,
    userCollections,
    selectedCollectionBook,
    setSelectedCollectionBook,
    getCollectionBook,
    openCollection,
    closeCollection,
    handleRemoveFromCollection,
    saveCollection,
    likeCollection,
    savingCollectionId,
    likingCollectionId,
  } = useCollection();

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

  const isFavourites = category === "Favourites";

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
            null
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
              {displayedCollections.map((collection) => (
                <CollectionCard
                  key={collection.id}
                  collection={collection}
                  openCollection={openCollection}
                  getCollectionBook={getCollectionBook}
                  saveCollection={saveCollection}
                  likeCollection={likeCollection}
                  savingCollectionId={savingCollectionId}
                  likingCollectionId={likingCollectionId}
                />
              ))}
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
                  {savedCollectionCards.map((collection) => (
                    <CollectionCard
                      key={collection.id}
                      collection={collection}
                      openCollection={openCollection}
                      getCollectionBook={getCollectionBook}
                      saveCollection={saveCollection}
                      likeCollection={likeCollection}
                      savingCollectionId={savingCollectionId}
                      likingCollectionId={likingCollectionId}
                    />
                  ))}
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
            {displayedCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                openCollection={openCollection}
                getCollectionBook={getCollectionBook}
                saveCollection={saveCollection}
                likeCollection={likeCollection}
                savingCollectionId={savingCollectionId}
                likingCollectionId={likingCollectionId}
              />
            ))}
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

      {activeCollection && (
        <CollectionList
          activeCollection={activeCollection}
          selectedCollectionBook={selectedCollectionBook}
          setSelectedCollectionBook={setSelectedCollectionBook}
          closeCollection={closeCollection}
          getCollectionBook={getCollectionBook}
          handleRemoveFromCollection={handleRemoveFromCollection}
          uiUser={uiUser}
        />
      )}
    </section>
  );
};

export default BookList;
