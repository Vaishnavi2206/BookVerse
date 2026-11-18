import type { CellComponentProps } from "react-window";
import type { BookGridCellProps } from "../book-types";
import BookCard from "./BookCard";
import LoadMoreSentinel from "./LoadMoreSentinel";

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

export default BookGridCell;