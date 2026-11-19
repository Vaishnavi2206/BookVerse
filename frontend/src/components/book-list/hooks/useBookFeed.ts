import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GridImperativeAPI,
} from "react-window";
import { useNavigate } from "react-router-dom";
import type {
  Book,
  BookGridCellProps,
  BookResponse,
  BookView,
  ListTab,
  RequestCursor,
} from "../book-types";
import {
  DEFAULT_QUERY,
  getCacheKey,
  getFavouriteBooks,
  isBook,
  readCachedBooks,
} from "../book-list.utils";

const PAGE_SIZE = 10;

type UseBookFeedOptions = {
  category: string;
  listTab: ListTab;
  scrollElement: HTMLElement | null;
  collectionBooks: Book[];
};

export function useBookFeed({
  category,
  listTab,
  scrollElement,
  collectionBooks,
}: UseBookFeedOptions) {
  const [columns, setColumns] = useState(5);
  const [gridHeight, setGridHeight] = useState(600);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const [headerElement, setHeaderElement] = useState<HTMLElement | null>(null);
  const setGridRef = useCallback((api: GridImperativeAPI | null) => {
    setGridElement(api?.element ?? null);
  }, []);

  const updateGridDimensions = useCallback(() => {
    if (!listElement || !scrollElement) {
      return;
    }

    const width = listElement.clientWidth;
    setColumns(Math.max(1, Math.floor(width / 205)));
    const availableHeight =
      scrollElement.clientHeight - (headerElement?.offsetHeight ?? 0) - 48;
    setGridHeight(Math.max(2, availableHeight));
  }, [headerElement, listElement, scrollElement]);

  useEffect(() => {
    if (!listElement || !scrollElement) {
      return;
    }

    const observer = new ResizeObserver(updateGridDimensions);
    observer.observe(listElement);
    observer.observe(scrollElement);
    if (headerElement) {
      observer.observe(headerElement);
    }
    return () => observer.disconnect();
  }, [headerElement, listElement, scrollElement, updateGridDimensions]);

  const [initialBooks] = useState(() => readCachedBooks(DEFAULT_QUERY));
  const initialHasMore =
    initialBooks === null || initialBooks.length % PAGE_SIZE === 0;
  const [favouriteBooks] = useState<Book[]>(getFavouriteBooks);
  const [bookView, setBookView] = useState<BookView>("all");
  const [books, setBooks] = useState<Book[]>(initialBooks ?? []);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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

  const isFavourites = category === "Favourites";
  const baseBooks = isFavourites ? favouriteBooks : books;
  const visibleBooks =
    listTab !== "books"
      ? []
      : bookView === "all"
        ? baseBooks
        : isFavourites
          ? collectionBooks.filter((book) =>
              favouriteBooks.some((favourite) => favourite.key === book.key),
            )
          : collectionBooks;
  const canLoadMore =
    listTab === "books" && bookView === "all" && !isFavourites && hasMore;

  const loadNextPage = useCallback(async () => {
    const cursor = requestRef.current;
    if (cursor.loading || !cursor.hasMore) {
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

      const favouriteKeys = new Set(
        favouritesRef.current.map((book) => book.key),
      );
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

      const favouriteKeys = new Set(
        favouritesRef.current.map((book) => book.key),
      );
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

  const retryLoad = useCallback(() => {
    const cursor = requestRef.current;
    cursor.hasMore = true;
    setHasMore(true);
    setError(null);
  }, []);

  const getBookDetails = useCallback(
    (book: Book) => {
      navigate("/book-details", { state: { book } });
    },
    [navigate],
  );

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

  return {
    bookView,
    setBookView,
    canLoadMore,
    cellProps,
    columns,
    error,
    gridHeight,
    handleSearch,
    isLoading,
    listElement,
    retryLoad,
    rowCount,
    setGridRef,
    setHeaderElement,
    setListElement,
    visibleBooks,
  };
}
