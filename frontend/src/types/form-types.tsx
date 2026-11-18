type Book = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
};

type BookWork = {
  title?: string;
  description?: string | { value?: string };
  subjects?: string[];
  first_publish_date?: string;
};

type LibraryFormProps = {
  book: Book;
  onClose: () => void;
};

type TabId =
  | "book-details"
  | "library-and-reading-preferences"
  | "reading-progress-and-goals"
  | "review-and-confirmation";

type LibraryBook = {
  key?: string;
  libraryStatus: ReadingStatus;
  collectionName?: string;
  collectionIsPublic?: boolean;
  collectionIds?: string[];
  collectionNames?: string[];
  collectionVisibility?: Record<string, boolean>;
  bookFields: {
    title?: string;
    author?: string;
    description?: string;
    firstPublished?: string;
    subjects?: string;
  };
  currentPage?: number;
  readingFormat?: "Physical" | "Ebook" | "Audiobook";
  personalRating?: number;
  favourite?: boolean;
  dateAdded?: string;
  startDate?: string;
  targetCompletionDate?: string;
  readingGoalEnabled?: boolean;
  dailyPageGoal?: number;
  reviewTitle?: string;
  reviewText?: string;
  favouriteQuote?: string;
  privateNote?: string;
};


 export const readingStatuses = [
  "Want to Read",
  "Reading",
  "Completed",
  "Paused",
  "Did Not Finish",
] as const;

type ReadingStatus = (typeof readingStatuses)[number];

export type { Book, BookWork, LibraryFormProps, TabId, LibraryBook };