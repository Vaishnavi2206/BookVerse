import { getLibraryState } from "./api";
import type { LibraryBook } from "../types/form-types";
import { getCachedLibraryBook } from "./library-cache-db";
import type { UserCollection } from "./api";

type OpenLibraryWork = {
  title?: string;
  description?: string | { value?: string };
  subjects?: string[];
  first_publish_date?: string;
  authors?: { author?: { key?: string } }[];
};

type OpenLibraryAuthor = {
  name?: string;
};

async function fetchBookFields(bookId: string): Promise<LibraryBook["bookFields"]> {
  if (!bookId.startsWith("/works/")) {
    throw new Error(`Unsupported Open Library book ID: ${bookId}`);
  }

  const workResponse = await fetch(`https://openlibrary.org${bookId}.json`);
  if (!workResponse.ok) {
    throw new Error(`Book details request failed (${workResponse.status}).`);
  }

  const work: OpenLibraryWork = await workResponse.json();
  const authorNames = await Promise.all(
    (work.authors ?? []).map(async ({ author }) => {
      if (!author?.key?.startsWith("/authors/")) return null;
      const authorResponse = await fetch(
        `https://openlibrary.org${author.key}.json`,
      );
      if (!authorResponse.ok) {
        throw new Error(`Author details request failed (${authorResponse.status}).`);
      }
      const authorDetails: OpenLibraryAuthor = await authorResponse.json();
      return authorDetails.name ?? null;
    }),
  );
  const description =
    typeof work.description === "string"
      ? work.description
      : work.description?.value ?? "";

  return {
    title: work.title ?? bookId,
    author: authorNames.filter((name): name is string => Boolean(name)).join(", ") ||
      "Unknown author",
    firstPublished: work.first_publish_date ?? "Unknown",
    description: description || "No description available",
    subjects: work.subjects?.join(", ") ?? "Not available",
  };
}

export async function restoreLibraryFromFirestore(userId: string): Promise<{
  books: LibraryBook[];
  collections: UserCollection[];
  publicCollections: UserCollection[];
  savedCollections: UserCollection[];
}> {
  const {
    library,
    collections,
    publicCollections,
    savedCollections,
  } = await getLibraryState();
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const books = await Promise.all(
    library.map(async (entry): Promise<LibraryBook> => {
      let bookFields: LibraryBook["bookFields"];
      let cachedBook: LibraryBook | null = null;
      try {
        cachedBook = await getCachedLibraryBook(userId, entry.bookId);
        bookFields = cachedBook?.bookFields ?? await fetchBookFields(entry.bookId);
      } catch (error) {
        console.error(`Unable to restore book details for ${entry.bookId}.`, error);
        bookFields = {
          title: entry.bookId,
          author: "Unknown author",
          description: "Book details could not be restored.",
          subjects: "Not available",
        };
      }

      const memberCollections = entry.collectionIds
        .map((id) => collectionsById.get(id))
        .filter((collection) => collection !== undefined);
      return {
        ...(cachedBook ?? {}),
        key: entry.bookId,
        libraryStatus: entry.readingStatus,
        readingFormat: entry.readingFormat,
        personalRating: entry.personalRating,
        favourite: entry.isFavourite,
        currentPage: entry.currentPage,
        dateAdded: entry.dateAdded,
        startDate: entry.readingStartDate ?? "",
        targetCompletionDate: entry.targetCompletionDate ?? "",
        reviewTitle: entry.reviewTitle,
        reviewText: entry.reviewText,
        readingGoalEnabled: entry.readingGoalEnabled,
        dailyPageGoal: entry.dailyPageGoal ?? undefined,
        favouriteQuote: entry.favouriteQuote,
        privateNote: entry.privateNote,
        collectionIds: entry.collectionIds,
        collectionNames: memberCollections.map((collection) => collection.name),
        collectionVisibility: Object.fromEntries(
          memberCollections.map((collection) => [
            collection.id,
            collection.isPublic,
          ]),
        ),
        collectionName: memberCollections[0]?.name ?? "",
        collectionIsPublic: memberCollections[0]?.isPublic ?? false,
        bookFields,
      };
    }),
  );

  return { books, collections, publicCollections, savedCollections };
}
