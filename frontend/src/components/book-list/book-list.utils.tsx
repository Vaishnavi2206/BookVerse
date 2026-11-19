import { useState } from "react";
import { type LibraryListBook } from "../../shared/library-state";
import type { Book, CollectionBook } from "./book-types";

const CACHE_PREFIX = "bookList:";
const FAVOURITES_KEY = "bookFavourites";
export const DEFAULT_QUERY = "thriller";

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
      : ["Unknown author"],
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

export {isBook, toBook, CollectionBookCover, getCacheKey, readCachedBooks, getFavouriteBooks};