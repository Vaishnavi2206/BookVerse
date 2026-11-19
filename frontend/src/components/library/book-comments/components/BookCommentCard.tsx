import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { CommentSyncMutation } from "../../../../shared/api";
import {
  COMMENT_MAX_LENGTH,
  type CommentView,
  type ReplyTarget,
  compareComments,
  getCommentTime,
  handleEnterToSend,
  initials,
  relativeTime,
  startEditing,
} from "../book-comments.utils";

type SharedProps = {
  comments: CommentView[];
  sortedMutations: CommentSyncMutation[];
  userId: string;
  editingCommentId: string | null;
  setEditingCommentId: Dispatch<SetStateAction<string | null>>;
  editDraft: string;
  setEditDraft: Dispatch<SetStateAction<string>>;
  saveEdit: (comment: CommentView) => Promise<void>;
  mutatingCommentId: string | null;
  replyTarget: ReplyTarget | null;
  setReplyTarget: Dispatch<SetStateAction<ReplyTarget | null>>;
  replyDraft: string;
  setReplyDraft: Dispatch<SetStateAction<string>>;
  submitReply: () => Promise<void>;
  startReply: (comment: CommentView) => void;
  deleteComment: (comment: CommentView) => Promise<void>;
  expandedRoots: Set<string>;
  isPosting: boolean;
};

type CommentCardProps = SharedProps & {
  comment: CommentView;
  depth: number;
};

export default function CommentCard({
  comment,
  depth,
  ...sharedProps
}: CommentCardProps): ReactNode {
  const {
    comments,
    sortedMutations,
    userId,
    editingCommentId,
    setEditingCommentId,
    editDraft,
    setEditDraft,
    saveEdit,
    mutatingCommentId,
    replyTarget,
    setReplyTarget,
    replyDraft,
    setReplyDraft,
    submitReply,
    startReply,
    deleteComment,
    expandedRoots,
    isPosting,
  } = sharedProps;
  const timeLabel = relativeTime(getCommentTime(comment));
  const pendingMutation = sortedMutations.find(
    (mutation) => mutation.id === comment.id,
  );
  const isEdited = Boolean(
    comment.editedAt || pendingMutation?.operation === "edit",
  );
  const children = comments
    .filter(
      (candidate) =>
        candidate.rootId === comment.rootId &&
        candidate.parentId === comment.id,
    )
    .sort(compareComments);

  return (
    <article
      className={`book-comment ${depth > 0 ? "book-comment-reply" : ""}`}
      key={comment.id}
      style={{ marginLeft: `${Math.min(depth, 3) * 18}px` }}
    >
      <div className="book-comment-avatar" aria-hidden="true">
        {comment.authorPhotoUrl ? (
          <img src={comment.authorPhotoUrl} alt="" />
        ) : (
          initials(comment.authorName)
        )}
      </div>
      <div className="book-comment-content">
        <div className="book-comment-meta">
          <strong>{comment.authorName}</strong>
          <time dateTime={getCommentTime(comment)}>{timeLabel}</time>
          {isEdited && <span>edited</span>}
          {comment.syncStatus !== "synced" && (
            <span className={`book-comment-sync ${comment.syncStatus}`}>
              {comment.syncStatus === "syncing" ? "Syncing" : "Waiting to sync"}
            </span>
          )}
        </div>

        {comment.deletedAt ? (
          <p className="book-comment-deleted">Comment deleted</p>
        ) : editingCommentId === comment.id ? (
          <div className="book-comment-edit">
            <textarea
              aria-label="Edit comment"
              maxLength={COMMENT_MAX_LENGTH}
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              onKeyDown={(event) =>
                handleEnterToSend(event, () => void saveEdit(comment))
              }
            />
            <div className="book-comment-editor-actions">
              <span>
                {editDraft.length}/{COMMENT_MAX_LENGTH}
              </span>
              <button
                type="button"
                className="book-comment-text-button"
                onClick={() => setEditingCommentId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="book-comment-primary-button"
                disabled={
                  !editDraft.trim() ||
                  editDraft.trim() === comment.body ||
                  mutatingCommentId === comment.id
                }
                onClick={() => void saveEdit(comment)}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="book-comment-body">{comment.body}</p>
        )}

        <div className="book-comment-actions">
          <button
            type="button"
            className="book-comment-text-button"
            onClick={() => startReply(comment)}
          >
            Reply
          </button>
          {comment.userId === userId && !comment.deletedAt && (
            <>
              <button
                type="button"
                className="book-comment-text-button"
                onClick={() =>
                  startEditing(
                    comment,
                    setEditingCommentId,
                    setEditDraft,
                    setReplyTarget,
                  )
                }
              >
                Edit
              </button>
              <button
                type="button"
                className="book-comment-text-button book-comment-delete-button"
                disabled={mutatingCommentId === comment.id}
                onClick={() => void deleteComment(comment)}
              >
                Delete
              </button>
            </>
          )}
        </div>

        {replyTarget?.id === comment.id && (
          <div className="book-comment-reply-composer">
            <span>Replying to {replyTarget.authorName}</span>
            <textarea
              aria-label={`Reply to ${replyTarget.authorName}`}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Write a thoughtful reply..."
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              onKeyDown={(event) =>
                handleEnterToSend(event, () => void submitReply())
              }
            />
            <div className="book-comment-editor-actions">
              <span>
                {replyDraft.length}/{COMMENT_MAX_LENGTH}
              </span>
              <button
                type="button"
                className="book-comment-text-button"
                onClick={() => setReplyTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="book-comment-primary-button"
                disabled={!replyDraft.trim() || isPosting}
                onClick={() => void submitReply()}
              >
                Reply
              </button>
            </div>
          </div>
        )}

        {expandedRoots.has(comment.rootId) &&
          children.map((child) => (
            <CommentCard
              key={child.id}
              comment={child}
              depth={depth + 1}
              {...sharedProps}
            />
          ))}
      </div>
    </article>
  );
}
