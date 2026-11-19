import { useState } from "react";
import { Grid } from "react-window";
import "./BookList.css";
import Search from "../search/Search";
import { useAuth } from "../../context/AuthContext";
import { useLibraryState } from "../../shared/library-state";
import type { ListTab, CollectionTab } from "./book-types";
import BookGridCell from "./components/BookGrid";
import CollectionCard from "./components/CollectionCard";
import { useCollection } from "./hooks/useCollection";
import CollectionList from "./components/CollectionList";
import { useBookFeed } from "./hooks/useBookFeed";

const BookList = ({
  category,
  scrollElement,
}: {
  category: string;
  scrollElement: HTMLElement | null;
}) => {
  const { uiUser } = useAuth();
  const libraryState = useLibraryState(uiUser?.userId);
  const {
    activeCollection,
    browseCollections,
    collectionBooks,
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

  const [listTab, setListTab] = useState<ListTab>("books");
  const [collectionTab, setCollectionTab] = useState<CollectionTab>("mine");


  const showingCollections = listTab === "collections";
  const isFavourites = category === "Favourites";
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

    const {
    bookView,
    handleSearch,
    canLoadMore,
    rowCount,
    isLoading,
    error,
    gridHeight,
    listElement,
    retryLoad,
    setGridRef,
    setHeaderElement,
    setListElement,
    cellProps,
    visibleBooks,
    columns,
  } = useBookFeed({ category, listTab, scrollElement, collectionBooks });


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
          <div
            className="book-list-tabs"
            role="tablist"
            aria-label="Books and collections"
          >
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
          ) : null}
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
                <span
                  className="book-collection-folder-icon"
                  aria-hidden="true"
                >
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
            onClick={retryLoad}
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
