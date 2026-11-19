import type { AuthUser } from "../../../context/AuthContext";
import type { Collection, CollectionBook } from "../book-types";
import { CollectionBookCover } from "../book-list.utils";

type CollectionListProps = {
  activeCollection: Collection;
  selectedCollectionBook: CollectionBook | null;
  setSelectedCollectionBook: (book: CollectionBook | null) => void;
  closeCollection: () => void;
  getCollectionBook: (collection: Collection, index: number) => CollectionBook;
  handleRemoveFromCollection: (
    collection: Collection,
    bookId: string,
    uiUser: AuthUser | null,
  ) => Promise<void>;
  uiUser: AuthUser | null;
};

export default function CollectionList({
  activeCollection,
  selectedCollectionBook,
  setSelectedCollectionBook,
  closeCollection,
  getCollectionBook,
  handleRemoveFromCollection,
  uiUser,
}: CollectionListProps) {
  return (
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
                                uiUser
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
  );
}