
import type { Book } from "../book-types";

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

export default BookCard;