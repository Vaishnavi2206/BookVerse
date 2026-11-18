import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { BookWork } from "../../types/form-types";
import DashboardSidebar from "../book-list/dashboard/DashboardSidebar";
import type { DashboardPage } from "../book-list/dashboard/DashboardPages";
import BookComments from "../library/book-comments/BookComments";
import LibraryForm from "../library/library-form/LibraryForm";
import "./BookDetails.css";

type Book = {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
};

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

function getDescription(description: BookWork["description"]): string {
  if (typeof description === "string") {
    return description;
  }
  return description?.value ?? "";
}

const BookDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState: unknown = location.state;
  const candidate =
    typeof locationState === "object" && locationState !== null
      ? "book" in locationState
        ? locationState.book
        : null
      : null;
  const book = isBook(candidate) ? candidate : null;
  const [bookDetails, setBookDetails] = useState<BookWork | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [showLibraryForm, setShowLibraryForm] = useState(false);
  const [failedCoverId, setFailedCoverId] = useState<number | null>(null);
  const bookKey = book?.key;

  useEffect(() => {
    if (!bookKey) return;

    const controller = new AbortController();
    async function fetchBookDetails() {
      setBookDetails(null);
      setDetailsError(null);
      try {
        const response = await fetch(`https://openlibrary.org${bookKey}.json`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Book details request failed (${response.status}).`);
        }
        setBookDetails(await response.json());
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setDetailsError(
          error instanceof Error ? error.message : "Unable to load book details.",
        );
      }
    }

    void fetchBookDetails();
    return () => controller.abort();
  }, [bookKey]);

  return (
    <div className="book-details-layout">
      <main className="book-details-content">
        <div className="book-details-page">
          {!book ? (
            <>
              <Link className="book-details-back" to="/dashboard">
                Back to books
              </Link>
              <section className="book-details-empty">
                <h1>No book selected</h1>
                <p>Choose a book from your list to view its details.</p>
              </section>
            </>
          ) : (
            <>
              <Link className="book-details-back" to="/dashboard">
                <span aria-hidden="true">←</span> Back to books
              </Link>

              <section
                className="book-details-card"
                aria-labelledby="book-details-title"
              >
                <div className="book-details-cover">
                  {book.cover_i && failedCoverId !== book.cover_i ? (
                    <img
                      src={`https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`}
                      alt={`Cover of ${book.title}`}
                      onError={() => setFailedCoverId(book.cover_i ?? null)}
                    />
                  ) : (
                    <div className="book-details-cover-placeholder" aria-hidden="true">
                      {book.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="book-details-information">
                  <p className="book-details-eyebrow">Book details</p>
                  <h1 id="book-details-title">{book.title}</h1>
                  <p className="book-details-authors">
                    by {book.author_name?.join(", ") || "Unknown author"}
                  </p>
                  {book.first_publish_year && (
                    <p className="book-details-year">
                      First published {book.first_publish_year}
                    </p>
                  )}

                  <button
                    type="button"
                    className="book-details-add-button"
                    onClick={() => setShowLibraryForm(true)}
                  >
                    Add to my library
                  </button>

                  <section
                    className="book-details-description"
                    aria-labelledby="description-heading"
                  >
                    <h2 id="description-heading">About this book</h2>
                    {detailsError ? (
                      <p className="book-details-error" role="alert">
                        {detailsError}
                      </p>
                    ) : !bookDetails ? (
                      <p role="status">Loading book description...</p>
                    ) : (
                      <p>
                        {getDescription(bookDetails.description) ||
                          "No description available."}
                      </p>
                    )}
                  </section>
                </div>
              </section>

              <BookComments bookId={book.key} />

              {showLibraryForm && (
                <LibraryForm
                  book={book}
                  onClose={() => setShowLibraryForm(false)}
                />
              )}
            </>
          )}
        </div>
      </main>

      <DashboardSidebar
        activePage="Books"
        onPageChange={(page: DashboardPage) =>
          navigate("/dashboard", { state: { dashboardPage: page } })
        }
        side="right"
      />
    </div>
  );
};

export default BookDetails;
