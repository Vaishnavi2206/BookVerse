type Book = {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  favourite?: boolean;
};

type Collection = {
  id: string;
  ownerId?: string;
  ownerName?: string;
  ownerPhotoUrl?: string | null;
  name: string;
  description: string;
  owner: string;
  isPublic: boolean;
  bookTitles: string[];
  bookIds?: string[];
  canManage?: boolean;
  isSample?: boolean;
  canSave?: boolean;
  isSaved?: boolean;
  showOwnerProfile?: boolean;
  likeCount?: number;
  isLiked?: boolean;
};

type CollectionBook = {
  key?: string;
  title: string;
  author: string;
  firstPublished?: string;
};

type BookView = "all" | "private" | "public";
type ListTab = "books" | "collections";
type CollectionTab = "mine" | "saved" | "browse";

type BookResponse = {
  docs?: Book[];
  numFound?: number;
};

type BookGridCellProps = {
  books: Book[];
  columns: number;
  canLoadMore: boolean;
  scrollRoot: HTMLElement | null;
  coverHeight: number;
  onLoadMore: () => void;
  onBookDetails: (book: Book) => void;
};

type RequestCursor = {
  query: string;
  nextPage: number;
  hasMore: boolean;
  loading: boolean;
  requestId: number;
};

export type { Book, Collection, CollectionBook, BookView, ListTab, CollectionTab, BookResponse, BookGridCellProps, RequestCursor };