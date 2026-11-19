import type { Collection } from "../book-types";
import type { CollectionBook } from "../book-types";
import { CollectionBookCover } from "../book-list.utils";

type CollectionCardProps = {
  collection: Collection;
  openCollection: (collection: Collection, book?: CollectionBook) => void;
  getCollectionBook: (collection: Collection, index: number) => CollectionBook;
  saveCollection: (collection: Collection) => Promise<void>;
  likeCollection: (collection: Collection) => Promise<void>;
  savingCollectionId: string | null;
  likingCollectionId: string | null;
};

const CollectionCard = ({
  collection,
  openCollection,
  getCollectionBook,
  saveCollection,
  likeCollection,
  savingCollectionId,
  likingCollectionId,
}: CollectionCardProps) => {
  return (
    <article className="book-collection-card">
    {collection.showOwnerProfile && (
      <div className="book-collection-owner">
        <span className="book-collection-owner-photo" aria-hidden="true">
          <span>{(collection.ownerName || "R").charAt(0).toUpperCase()}</span>
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
          <span aria-hidden="true">{collection.isLiked ? "♥" : "♡"}</span>
          <span>{collection.likeCount ?? 0}</span>
        </button>
      )}
      <span
        className={`book-collection-visibility${collection.isPublic ? " is-public" : ""}`}
      >
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
    {collection.isSample && (
      <span className="book-collection-sample">Sample</span>
    )}
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
          disabled={collection.isSaved || savingCollectionId === collection.id}
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
};

export default CollectionCard;
