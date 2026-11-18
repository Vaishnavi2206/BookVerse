import { useState } from "react";
import { readingStatuses } from "../../../types/form-types";
import "./LibraryDetails.css";
import { useAuth } from "../../../context/AuthContext";
import { toast } from "react-toastify";
import {
  removeBookFromLibraryState,
  useLibraryState,
} from "../../../shared/library-state";

type ReadingStatus = (typeof readingStatuses)[number];

const LibraryDetails = () => {
  const { uiUser } = useAuth();
  const libraryState = useLibraryState(uiUser?.userId);
  const books = libraryState.books;
  const [activeStatus, setActiveStatus] = useState<ReadingStatus>(
    readingStatuses[0],
  );

  const [expandedDescriptions, setExpandedDescriptions] = useState<
    Record<string, boolean>
  >({});

  const sections = readingStatuses.map((status) => ({
    title: status,
    count: books.filter((book) => book.libraryStatus === status).length,
  }));

  const activeBooks = books.filter(
    (book) => book.libraryStatus === activeStatus,
  );

  const handleDelete = async (bookId: string) => {
    if (!uiUser?.userId) return;
    try {
      await removeBookFromLibraryState(uiUser.userId, bookId);
    } catch (deleteError) {
      toast.warning(
        deleteError instanceof Error
          ? `Removed from this view, but could not update the local cache: ${deleteError.message}`
          : "Removed from this view, but could not update the local cache.",
      );
    }
  };

  return (
    <section className="library-page" aria-labelledby="library-title">
      <header className="library-page-header">
        <div>
          <span className="library-eyebrow">YOUR PERSONAL COLLECTION</span>
          <h1 id="library-title">My library</h1>
          <p>Keep track of what you’re reading and what’s next.</p>
        </div>
        <div
          className="library-total"
          aria-label={`${books.length} books total`}
        >
          <span>{books.length}</span>
          <span>{books.length === 1 ? "book saved" : "books saved"}</span>
        </div>
      </header>

      {libraryState.loading && (
        <p role="status">Loading your library...</p>
      )}
      {libraryState.error && (
        <p className="library-form-error" role="alert">
          Unable to load your library: {libraryState.error}
        </p>
      )}

      <nav className="library-status-list" aria-label="Filter books by status">
        {sections.map((section, index) => (
          <button
            type="button"
            key={section.title}
            className={`library-status library-status-${index}${activeStatus === section.title ? " is-active" : ""}`}
            onClick={() => setActiveStatus(section.title)}
            aria-pressed={activeStatus === section.title}
          >
            <span>{section.title}</span>
            <span className="library-status-count">{section.count}</span>
          </button>
        ))}
      </nav>

      <div className="library-books-heading">
        <div>
          <h2>{activeStatus}</h2>
          <p>
            {activeBooks.length === 1
              ? "1 book in this collection"
              : `${activeBooks.length} books in this collection`}
          </p>
        </div>
      </div>

      {activeBooks.length > 0 ? (
        <div
          className="library-book-scroll"
          aria-label={`${activeStatus} books`}
        >
          <div className="library-book-grid">
            {activeBooks.map((book, index) => {
              const title = book.bookFields?.title?.trim() || "Untitled book";
              const author =
                book.bookFields?.author?.trim() || "Unknown author";
              const description = book.bookFields?.description?.trim();
              const descriptionId = `${book.key ?? "book"}-${index}-description`;
              const isDescriptionExpanded =
                expandedDescriptions[descriptionId] ?? false;

              return (
                <article
                  className="library-book-card"
                  key={`${book.key ?? title}-${index}`}
                >
                  <div
                    className={`library-book-cover library-book-cover-${index % 5}`}
                    aria-hidden="true"
                  >
                    <span>{title.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="library-book-content">
                    <button
                      type="button"
                      className="library-book-delete"
                      onClick={() => void handleDelete(book.key ?? "")}
                      aria-label={`Delete ${title} from your library`}
                    >
                      ×
                    </button>
                    <div className="library-book-topline">
                      <span className="library-book-status">
                        {activeStatus}
                      </span>
                      {book.readingFormat && (
                        <span className="library-book-format">
                          {book.readingFormat}
                        </span>
                      )}
                    </div>
                    <h3>{title}</h3>
                    <p className="library-book-author">{author}</p>
                    {description &&
                      description !== "No description available" && (
                        <div className="library-book-description-group">
                          <p
                            id={descriptionId}
                            className={`library-book-description${isDescriptionExpanded ? " is-expanded" : ""}`}
                          >
                            {description}
                          </p>
                          <button
                            type="button"
                            className="library-book-description-toggle"
                            aria-expanded={isDescriptionExpanded}
                            aria-controls={descriptionId}
                            onClick={() =>
                              setExpandedDescriptions((expanded) => ({
                                ...expanded,
                                [descriptionId]: !isDescriptionExpanded,
                              }))
                            }
                          >
                            {isDescriptionExpanded ? "Show less" : "Read more"}
                          </button>
                        </div>
                      )}
                    <div className="library-book-meta">
                      {typeof book.currentPage === "number" &&
                        book.currentPage > 0 && (
                          <span>Page {book.currentPage}</span>
                        )}
                      {book.bookFields?.firstPublished && (
                        <span>{book.bookFields.firstPublished}</span>
                      )}
                      {typeof book.personalRating === "number" && (
                        <span>{book.personalRating}/5 rating</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="library-empty-state">
          <span className="library-empty-icon" aria-hidden="true">
            {books.length === 0 ? "＋" : "↗"}
          </span>
          <h3>
            {books.length === 0
              ? "Your library is waiting"
              : "Nothing here just yet"}
          </h3>
          <p>
            {books.length === 0
              ? "Add a book from the Books page and it will show up here."
              : `Books you mark as “${activeStatus}” will appear here.`}
          </p>
        </div>
      )}
    </section>
  );
};

export default LibraryDetails;
