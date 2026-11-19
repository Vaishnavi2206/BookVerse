import "./BookComments.css";
import CommentCard from "./components/BookCommentCard";
import { useBookComments } from "./hooks/useBookComment";
import { useAuth } from "../../../context/AuthContext";
import {
  COMMENT_MAX_LENGTH,
  initials,
  handleEnterToSend,
} from "./book-comments.utils";

function BookComments({ bookId }: { bookId: string }) {
  const {
    flushComments,
    isOnline,
    isSyncing,
    comments,
    pendingMutations,
    sortedMutations,
    sort,
    setSort,
    commentsCursor,
    replyCursors,
    expandedRoots,
    loading,
    loadingOlder,
    loadingReplies,
    rootComments,
    rootDraft,
    setRootDraft,
    submitRootComment,
    replyTarget,
    setReplyTarget,
    replyDraft,
    setReplyDraft,
    submitReply,
    editingCommentId,
    setEditingCommentId,
    editDraft,
    setEditDraft,
    saveEdit,
    mutatingCommentId,
    startReply,
    deleteComment,
    loadOlderComments,
    loadReplyPage,
    toggleReplies,
    syncError,
    outboxError,
    loadError,
    isPosting,
  } = useBookComments({ bookId });
  const { uiUser } = useAuth();
  const userId = uiUser?.userId ?? "";
  const authorName =
    uiUser?.displayName || uiUser?.email || "Book Verse reader";
  const authorPhotoUrl = uiUser?.photoUrl ?? null;

  const commentCardProps = {
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
  };

  return (
    <section className="book-comments" aria-labelledby="book-comments-title">
      <div className="book-comments-heading">
        <div>
          <p className="book-comments-eyebrow">Community</p>
          <h3 id="book-comments-title">Discussion</h3>
        </div>
        <label className="book-comments-sort">
          <span className="visually-hidden">Sort comments</span>
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as "newest" | "oldest")
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      {pendingMutations.length > 0 && (
        <div className="book-comments-sync-notice" role="status">
          <span>
            {pendingMutations.length} {pendingMutations.length === 1 ? "change" : "changes"}{" "}
            waiting to sync
            {!isOnline && " — you're offline"}
          </span>
          <button
            type="button"
            className="book-comment-text-button"
            disabled={!isOnline || isSyncing}
            onClick={() => void flushComments()}
          >
            Sync now
          </button>
        </div>
      )}
      {syncError && (
        <p className="book-comments-error" role="alert">
          Sync failed: {syncError}. Your comments are saved on this device and will retry.
        </p>
      )}
      {outboxError && (
        <p className="book-comments-error" role="alert">
          Local comment storage error: {outboxError}
        </p>
      )}
      {loadError && (
        <p className="book-comments-error" role="alert">
          {loadError}
        </p>
      )}

      {userId ? (
        <div className="book-comment-composer">
          <div className="book-comment-avatar book-comment-current-avatar" aria-hidden="true">
            {authorPhotoUrl ? (
              <img src={authorPhotoUrl} alt="" />
            ) : (
              initials(authorName)
            )}
          </div>
          <div className="book-comment-composer-content">
            <textarea
              aria-label="Add a comment"
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Share your thoughts about this book..."
              value={rootDraft}
              onChange={(event) => setRootDraft(event.target.value)}
              onKeyDown={(event) =>
                handleEnterToSend(event, () => void submitRootComment())
              }
            />
            <div className="book-comment-editor-actions">
              <span>
                {rootDraft.length}/{COMMENT_MAX_LENGTH}
              </span>
              <button
                type="button"
                className="book-comment-primary-button"
                disabled={!rootDraft.trim() || isPosting}
                onClick={() => void submitRootComment()}
              >
                {isPosting ? "Saving..." : "Comment"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="book-comments-sign-in">Sign in to join the discussion.</p>
      )}

      <div className="book-comments-list" aria-live="polite">
        {loading && <p className="book-comments-empty">Loading discussion...</p>}
        {!loading && rootComments.length === 0 && !loadError && (
          <p className="book-comments-empty">
            No comments yet. Start the conversation.
          </p>
        )}
        {rootComments.map((root) => {
          const threadReplies = comments.filter(
            (comment) =>
              comment.rootId === root.id && comment.parentId !== null,
          );
          const threadIds = new Set(threadReplies.map((comment) => comment.id));
          const orphanReplies = threadReplies.filter(
            (reply) =>
              reply.parentId !== root.id &&
              !threadIds.has(reply.parentId ?? ""),
          );
          const replyCount =
            root.replyCount +
            pendingMutations.filter(
              (mutation) =>
                mutation.operation === "create" &&
                mutation.rootId === root.id &&
                mutation.parentId !== null,
            ).length;

          return (
            <div className="book-comment-thread" key={root.id}>
              <CommentCard
                comment={root}
                depth={0}
                {...commentCardProps}
              />
              {replyCount > 0 && (
                <button
                  type="button"
                  className="book-comment-thread-toggle"
                  aria-expanded={expandedRoots.has(root.id)}
                  onClick={() => void toggleReplies(root)}
                >
                  {loadingReplies.has(root.id)
                    ? "Loading replies..."
                    : expandedRoots.has(root.id)
                      ? "Hide replies"
                      : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
                </button>
              )}
              {expandedRoots.has(root.id) &&
                orphanReplies.map((reply) => (
                  <CommentCard
                    key={reply.id}
                    comment={reply}
                    depth={1}
                    {...commentCardProps}
                  />
                ))}
              {expandedRoots.has(root.id) &&
                replyCursors[root.id] && (
                  <button
                    type="button"
                    className="book-comment-thread-toggle"
                    disabled={loadingReplies.has(root.id)}
                    onClick={() =>
                      void loadReplyPage(root.id, replyCursors[root.id])
                    }
                  >
                    Load more replies
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {commentsCursor && (
        <button
          type="button"
          className="book-comments-load-more"
          disabled={loadingOlder}
          onClick={() => void loadOlderComments()}
        >
          {loadingOlder ? "Loading..." : "Load older comments"}
        </button>
      )}
    </section>
  );
}

export default BookComments;
