import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from "react";
import type {
  BookComment,
  CommentSyncMutation,
} from "../../../shared/api";

type CommentStatus = "pending" | "syncing" | "synced";
type CommentView = BookComment & { syncStatus: CommentStatus };
type ReplyTarget = { id: string; rootId: string; authorName: string };

const COMMENT_MAX_LENGTH = 500;

function createId() {
  return crypto.randomUUID();
}

function compareComments(left: BookComment, right: BookComment) {
  const leftTime = Date.parse(left.clientCreatedAt || left.createdAt);
  const rightTime = Date.parse(right.clientCreatedAt || right.createdAt);
  return leftTime - rightTime || left.id.localeCompare(right.id);
}

function asCommentView(comment: BookComment): CommentView {
  return { ...comment, syncStatus: "synced" };
}

function commentFromMutation(
  mutation: CommentSyncMutation,
  bookId: string,
  userId: string,
  authorName: string,
  authorPhotoUrl: string | null,
): CommentView {
  return {
    id: mutation.id,
    bookId,
    rootId: mutation.rootId,
    parentId: mutation.parentId,
    userId,
    authorName,
    authorPhotoUrl,
    body: mutation.deleted ? "" : mutation.body,
    createdAt: mutation.clientCreatedAt,
    clientCreatedAt: mutation.clientCreatedAt,
    editedAt: mutation.operation === "edit" ? mutation.queuedAt : null,
    deletedAt:
      mutation.operation === "delete" || mutation.deleted
        ? mutation.queuedAt
        : null,
    replyCount: 0,
    syncStatus: "pending",
  };
}

function applyPendingMutations(
  comments: CommentView[],
  mutations: CommentSyncMutation[],
  bookId: string,
  userId: string,
  authorName: string,
  authorPhotoUrl: string | null,
  syncingMutationIds: Set<string>,
): CommentView[] {
  const commentsById = new Map(
    comments.map((comment) => [comment.id, comment]),
  );

  for (const mutation of mutations) {
    const syncStatus = syncingMutationIds.has(mutation.mutationId)
      ? "syncing"
      : "pending";
    const existing = commentsById.get(mutation.id);

    if (mutation.operation === "create") {
      commentsById.set(
        mutation.id,
        existing
          ? {
              ...existing,
              body: mutation.deleted ? "" : mutation.body,
              deletedAt: mutation.deleted
                ? (existing.deletedAt ?? mutation.queuedAt)
                : existing.deletedAt,
              syncStatus,
            }
          : {
              ...commentFromMutation(
                mutation,
                bookId,
                userId,
                authorName,
                authorPhotoUrl,
              ),
              syncStatus,
            },
      );
    } else if (existing && mutation.operation === "edit") {
      commentsById.set(mutation.id, {
        ...existing,
        body: mutation.body,
        editedAt: mutation.queuedAt,
        syncStatus,
      });
    } else if (existing && mutation.operation === "delete") {
      commentsById.set(mutation.id, {
        ...existing,
        body: "",
        deletedAt: existing.deletedAt ?? mutation.queuedAt,
        syncStatus,
      });
    }
  }

  return [...commentsById.values()];
}

function getCommentTime(comment: BookComment) {
  return comment.clientCreatedAt || comment.createdAt;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function relativeTime(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "Just now";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(time).toLocaleDateString();
}

function handleEnterToSend(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  submit: () => void,
) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

function mergeComments(
  current: CommentView[],
  incoming: BookComment[],
  mutations: CommentSyncMutation[],
  bookId: string,
  userId: string,
  authorName: string,
  authorPhotoUrl: string | null,
  syncingMutationIds: Set<string>,
) {
  const commentsById = new Map(current.map((comment) => [comment.id, comment]));
  for (const comment of incoming) {
    const existing = commentsById.get(comment.id);
    if (!existing || existing.syncStatus === "synced") {
      commentsById.set(comment.id, asCommentView(comment));
    }
  }
  return applyPendingMutations(
    [...commentsById.values()],
    mutations,
    bookId,
    userId,
    authorName,
    authorPhotoUrl,
    syncingMutationIds,
  );
}

function startEditing(
  comment: CommentView,
  setEditingCommentId: Dispatch<SetStateAction<string | null>>,
  setEditDraft: Dispatch<SetStateAction<string>>,
  setReplyTarget: Dispatch<SetStateAction<ReplyTarget | null>>,
) {
  setEditingCommentId(comment.id);
  setEditDraft(comment.body);
  setReplyTarget(null);
}

export {
  COMMENT_MAX_LENGTH,
  type CommentView,
  type ReplyTarget,
  createId,
  compareComments,
  asCommentView,
  applyPendingMutations,
  getCommentTime,
  initials,
  relativeTime,
  handleEnterToSend,
  mergeComments,
  startEditing,
};
