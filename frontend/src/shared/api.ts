import { auth } from "./firebase";
import type { LibraryBook } from "../types/form-types";

export type CollectionItem = {
  bookId: string;
  addedAt?: string;
  sortOrder?: number;
};

export type UserCollection = {
  id: string;
  ownerId?: string;
  ownerName?: string;
  ownerPhotoUrl?: string | null;
  name: string;
  description: string;
  coverImageUrl: string;
  isPublic: boolean;
  bookCount: number;
  likeCount: number;
  isLiked?: boolean;
  items: CollectionItem[];
};

type AddToLibraryPayload = {
  userId: string;
  bookId: string;
  libraryFields: {
    readingStatus: string;
    readingFormat: LibraryBook["readingFormat"];
    personalRating: number;
    isFavourite: boolean;
    currentPage: number;
    dateAdded: string;
    readingStartDate: string;
    targetCompletionDate: string;
    reviewTitle: string;
    reviewText: string;
    readingGoalEnabled: boolean;
    dailyPageGoal: number | null;
    favouriteQuote: string;
    privateNote: string;
  };
  collectionIds?: string[];
  newCollection?: {
    name: string;
    isPublic: boolean;
  };
};

type AddToLibraryResponse = {
  success: true;
  libraryId: string;
  createdCollection: { id: string; name: string; isPublic: boolean } | null;
  collectionIds: string[];
};

export type LibraryEntry = {
  bookId: string;
  readingStatus: LibraryBook["libraryStatus"];
  readingFormat: NonNullable<LibraryBook["readingFormat"]>;
  personalRating: number;
  isFavourite: boolean;
  currentPage: number;
  dateAdded: string;
  readingStartDate: string | null;
  targetCompletionDate: string | null;
  reviewTitle: string;
  reviewText: string;
  readingGoalEnabled: boolean;
  dailyPageGoal: number | null;
  favouriteQuote: string;
  privateNote: string;
  collectionIds: string[];
};

export type LibraryStateResponse = {
  library: LibraryEntry[];
  collections: UserCollection[];
  publicCollections: UserCollection[];
  savedCollections: UserCollection[];
};

export type BookComment = {
  id: string;
  bookId: string;
  rootId: string;
  parentId: string | null;
  userId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  body: string;
  createdAt: string;
  clientCreatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyCount: number;
};

export type CommentSyncMutation = {
  mutationId: string;
  id: string;
  operation: "create" | "edit" | "delete";
  rootId: string;
  parentId: string | null;
  body: string;
  clientCreatedAt: string;
  queuedAt: string;
  deleted?: boolean;
};

export type CommentCursor = {
  createdAt: string;
  id: string;
};

export type BookCommentPage = {
  comments: BookComment[];
  nextCursor: CommentCursor | null;
  replyCount?: number;
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000")
  .replace(/\/+$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to save your library.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const responseText = await response.text();
  let responseBody: unknown = {};
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      throw new Error("The API returned an invalid response.");
    }
  }

  if (!response.ok) {
    const message =
      typeof responseBody === "object" &&
      responseBody !== null &&
      "error" in responseBody &&
      typeof responseBody.error === "string"
        ? responseBody.error
        : `The request failed (${response.status}).`;
    throw new Error(message);
  }

  return responseBody as T;
}

export function getMyCollections() {
  return request<{ collections: UserCollection[] }>("/collections");
}

export function getPublicCollections() {
  return request<{ collections: UserCollection[] }>("/public-collections");
}

export function getMyLibrary() {
  return request<{ library: LibraryEntry[] }>("/library");
}

export function getLibraryState() {
  return request<LibraryStateResponse>("/library-state");
}

export function savePublicCollection(collectionId: string) {
  return request<{ success: true; collection: UserCollection }>(
    `/collections/${encodeURIComponent(collectionId)}/save`,
    { method: "POST" },
  );
}

export function setCollectionLike(collectionId: string, liked: boolean) {
  return request<{ success: true; liked: boolean; likeCount: number }>(
    `/collections/${encodeURIComponent(collectionId)}/like`,
    {
      method: "PUT",
      body: JSON.stringify({ liked }),
    },
  );
}

export function getBookComments(
  bookId: string,
  sort: "newest" | "oldest",
  cursor?: CommentCursor | null,
) {
  const query = new URLSearchParams({ bookId, sort, limit: "20" });
  if (cursor) {
    query.set("cursorCreatedAt", cursor.createdAt);
    query.set("cursorId", cursor.id);
  }
  return request<BookCommentPage>(`/book-comments?${query.toString()}`);
}

export function getBookCommentReplies(
  bookId: string,
  rootId: string,
  cursor?: CommentCursor | null,
) {
  const query = new URLSearchParams({ bookId, rootId, limit: "50" });
  if (cursor) {
    query.set("cursorCreatedAt", cursor.createdAt);
    query.set("cursorId", cursor.id);
  }
  return request<BookCommentPage>(`/book-comments/replies?${query.toString()}`);
}

export function syncBookComments(
  bookId: string,
  mutations: CommentSyncMutation[],
  keepalive = false,
) {
  return request<{
    success: true;
    acknowledgedMutationIds: string[];
    replyCounts: Record<string, number>;
  }>("/book-comments/sync", {
    method: "POST",
    body: JSON.stringify({ bookId, mutations }),
    keepalive,
  });
}

export function addBookToLibrary(payload: AddToLibraryPayload) {
  return request<AddToLibraryResponse>("/add-to-library", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeBookFromCollection(collectionId: string, bookId: string) {
  return request<{ success: true }>(
    `/collections/${encodeURIComponent(collectionId)}/books`,
    {
      method: "DELETE",
      body: JSON.stringify({ bookId }),
    },
  );
}
