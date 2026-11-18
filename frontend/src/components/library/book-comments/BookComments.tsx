import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getBookCommentReplies,
  getBookComments,
  syncBookComments,
  type BookComment,
  type CommentCursor,
  type CommentSyncMutation,
} from "../../../shared/api";
import {
  getPendingCommentMutations,
  getPendingCommentMutation,
  putPendingCommentMutation,
  removeAcknowledgedCommentMutations,
} from "../../../shared/comment-outbox";
import "./BookComments.css";

type CommentStatus = "pending" | "syncing" | "synced";
type CommentView = BookComment & { syncStatus: CommentStatus };
type ReplyTarget = { id: string; rootId: string; authorName: string };

const COMMENT_MAX_LENGTH = 500;
const SYNC_THRESHOLD = 5;
const SYNC_DELAY_MS = 15_000;
const SYNC_BATCH_SIZE = 10;

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
  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  for (const mutation of mutations) {
    const syncStatus = syncingMutationIds.has(mutation.mutationId)
      ? "syncing"
      : "pending";
    const existing = byId.get(mutation.id);

    if (mutation.operation === "create") {
      byId.set(
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
      byId.set(mutation.id, {
        ...existing,
        body: mutation.body,
        editedAt: mutation.queuedAt,
        syncStatus,
      });
    } else if (existing && mutation.operation === "delete") {
      byId.set(mutation.id, {
        ...existing,
        body: "",
        deletedAt: existing.deletedAt ?? mutation.queuedAt,
        syncStatus,
      });
    }
  }

  return [...byId.values()];
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
  event: KeyboardEvent<HTMLTextAreaElement>,
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
  const byId = new Map(current.map((comment) => [comment.id, comment]));
  for (const comment of incoming) {
    const existing = byId.get(comment.id);
    if (!existing || existing.syncStatus === "synced") {
      byId.set(comment.id, asCommentView(comment));
    }
  }
  return applyPendingMutations(
    [...byId.values()],
    mutations,
    bookId,
    userId,
    authorName,
    authorPhotoUrl,
    syncingMutationIds,
  );
}

function BookComments({ bookId }: { bookId: string }) {
  const { uiUser } = useAuth();
  const userId = uiUser?.userId ?? "";
  const authorName =
    uiUser?.displayName || uiUser?.email || "Book Verse reader";
  const authorPhotoUrl = uiUser?.photoUrl ?? null;
  const [comments, setComments] = useState<CommentView[]>([]);
  const [pendingMutations, setPendingMutations] = useState<
    CommentSyncMutation[]
  >([]);
  const [syncingMutationIds, setSyncingMutationIds] = useState<Set<string>>(
    new Set(),
  );
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [commentsCursor, setCommentsCursor] = useState<CommentCursor | null>(
    null,
  );
  const [replyCursors, setReplyCursors] = useState<
    Record<string, CommentCursor | null>
  >({});
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set());
  const [loadedReplyRoots, setLoadedReplyRoots] = useState<Set<string>>(
    new Set(),
  );
  const [loadedRequestKey, setLoadedRequestKey] = useState("");
  const requestKey = `${userId}\u0000${bookId}\u0000${sort}`;
  const loading = loadedRequestKey !== requestKey;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [isPosting, setIsPosting] = useState(false);
  const [mutatingCommentId, setMutatingCommentId] = useState<string | null>(
    null,
  );
  const [rootDraft, setRootDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [outboxError, setOutboxError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [retryDelay, setRetryDelay] = useState(5000);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);
  const pendingCountRef = useRef(0);
  const flushRef = useRef<(keepalive?: boolean) => Promise<void>>(
    async () => {},
  );

  const syncingIds = useMemo(
    () => new Set([...syncingMutationIds]),
    [syncingMutationIds],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoadError(null);
      setOutboxError(null);
      setSyncError(null);
      setComments([]);
      setPendingMutations([]);
      setCommentsCursor(null);
      setReplyCursors({});
      setExpandedRoots(new Set());
      setLoadedReplyRoots(new Set());
      if (!userId) {
        setLoadError("Sign in to view and join the discussion.");
        setLoadedRequestKey(requestKey);
        return;
      }

      const [outboxResult, commentsResult] = await Promise.allSettled([
        getPendingCommentMutations(userId, bookId),
        getBookComments(bookId, sort),
      ]);
      if (!active) return;

      const mutations =
        outboxResult.status === "fulfilled" ? outboxResult.value : [];
      if (outboxResult.status === "rejected") {
        setOutboxError(
          outboxResult.reason instanceof Error
            ? outboxResult.reason.message
            : "Unable to load saved comments from this device.",
        );
      } else {
        setOutboxError(null);
      }
      setPendingMutations(mutations);
      pendingCountRef.current = mutations.length;

      if (commentsResult.status === "fulfilled") {
        const page = commentsResult.value;
        setComments(
          applyPendingMutations(
            page.comments.map(asCommentView),
            mutations,
            bookId,
            userId,
            authorName,
            authorPhotoUrl,
            new Set(),
          ),
        );
        setCommentsCursor(page.nextCursor);
        setLoadError(null);
      } else {
        setComments(
          applyPendingMutations(
            [],
            mutations,
            bookId,
            userId,
            authorName,
            authorPhotoUrl,
            new Set(),
          ),
        );
        setLoadError(
          commentsResult.reason instanceof Error
            ? commentsResult.reason.message
            : "Unable to load comments.",
        );
      }
      setLoadedRequestKey(requestKey);

      if (mutations.length > 0 && navigator.onLine) {
        window.setTimeout(() => void flushRef.current(false), 0);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [authorName, authorPhotoUrl, bookId, requestKey, sort, userId]);

  const flushComments = useCallback(async (keepalive = false) => {
    if (!userId || syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);
    const replyCounts = new Map<string, number>();
    let queue: CommentSyncMutation[];
    try {
      queue = await getPendingCommentMutations(userId, bookId);
      setPendingMutations(queue);
      pendingCountRef.current = queue.length;

      while (queue.length > 0) {
        const batch = queue.slice(0, keepalive ? 5 : SYNC_BATCH_SIZE);
        const batchCommentIds = new Set(batch.map((mutation) => mutation.id));
        setSyncingMutationIds(
          (previous) =>
            new Set([
              ...previous,
              ...batch.map((mutation) => mutation.mutationId),
            ]),
        );
        setComments((previous) =>
          previous.map((comment) =>
            batchCommentIds.has(comment.id)
              ? { ...comment, syncStatus: "syncing" }
              : comment,
          ),
        );
        const response = await syncBookComments(bookId, batch, keepalive);
        for (const [rootId, count] of Object.entries(response.replyCounts)) {
          replyCounts.set(rootId, count);
        }
        const acknowledgedIds = new Set(response.acknowledgedMutationIds);
        const accepted = batch.filter((mutation) =>
          acknowledgedIds.has(mutation.mutationId),
        );
        if (accepted.length !== batch.length) {
          throw new Error("Some comments were not acknowledged by the server.");
        }

        await removeAcknowledgedCommentMutations(userId, bookId, accepted);
        queue = await getPendingCommentMutations(userId, bookId);
        setPendingMutations(queue);
        pendingCountRef.current = queue.length;
        if (keepalive) break;
      }

      const remainingIds = new Set(queue.map((mutation) => mutation.id));
      setComments((previous) =>
        previous.map((comment) => {
          const stillPending = remainingIds.has(comment.id);
          const status: CommentStatus = stillPending ? "pending" : "synced";
          return {
            ...comment,
            syncStatus: status,
            replyCount:
              comment.parentId === null && replyCounts.has(comment.id)
                ? (replyCounts.get(comment.id) ?? comment.replyCount)
                : comment.replyCount,
          };
        }),
      );
      setSyncingMutationIds(new Set());
      setRetryAt(0);
      setRetryDelay(5000);
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Comments could not be synced.",
      );
      setRetryAt(Date.now() + retryDelay);
      setRetryDelay((delay) => Math.min(delay * 2, 60_000));
      setSyncingMutationIds(new Set());
      try {
        const queue = await getPendingCommentMutations(userId, bookId);
        setPendingMutations(queue);
        pendingCountRef.current = queue.length;
        const pendingIds = new Set(queue.map((mutation) => mutation.id));
        setComments((previous) =>
          previous.map((comment) => {
            const stillPending = pendingIds.has(comment.id);
            return {
              ...comment,
              syncStatus: stillPending
                ? "pending"
                : comment.syncStatus === "syncing"
                  ? "synced"
                  : comment.syncStatus,
              replyCount:
                comment.parentId === null && replyCounts.has(comment.id)
                  ? (replyCounts.get(comment.id) ?? comment.replyCount)
                  : comment.replyCount,
            };
          }),
        );
      } catch (outboxReadError) {
        setComments((previous) =>
          previous.map((comment) => ({
            ...comment,
            syncStatus:
              comment.syncStatus === "syncing"
                ? "pending"
                : comment.syncStatus,
            replyCount:
              comment.parentId === null && replyCounts.has(comment.id)
                ? (replyCounts.get(comment.id) ?? comment.replyCount)
                : comment.replyCount,
          })),
        );
        setOutboxError(
          outboxReadError instanceof Error
            ? outboxReadError.message
            : "Unable to read pending comments.",
        );
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [bookId, retryDelay, userId]);

  useEffect(() => {
    flushRef.current = flushComments;
  }, [flushComments]);

  useEffect(() => {
    pendingCountRef.current = pendingMutations.length;
  }, [pendingMutations]);

  useEffect(
    () => () => {
      if (pendingCountRef.current > 0) {
        void flushRef.current(true);
      }
    },
    [],
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void flushRef.current(false);
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushRef.current(true);
      }
    };
    const handlePageHide = () => void flushRef.current(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  useEffect(() => {
    if (pendingMutations.length === 0 || !isOnline) return;
    const oldestQueuedAt = Math.min(
      ...pendingMutations.map((mutation) => Date.parse(mutation.queuedAt)),
    );
    const thresholdAt =
      pendingMutations.length >= SYNC_THRESHOLD
        ? Date.now()
        : oldestQueuedAt + SYNC_DELAY_MS;
    const nextAttemptAt = Math.max(thresholdAt, retryAt);
    const timeout = Math.max(0, nextAttemptAt - Date.now());
    const timer = window.setTimeout(() => {
      void flushRef.current(false);
    }, timeout);
    return () => window.clearTimeout(timer);
  }, [isOnline, pendingMutations, retryAt]);

  const rootComments = useMemo(
    () =>
      comments
        .filter((comment) => comment.parentId === null)
        .sort((left, right) =>
          sort === "newest"
            ? compareComments(right, left)
            : compareComments(left, right),
        ),
    [comments, sort],
  );

  const sortedMutations = useMemo(
    () =>
      pendingMutations.slice().sort((left, right) =>
        left.queuedAt.localeCompare(right.queuedAt),
      ),
    [pendingMutations],
  );

  function applyCurrentMutations(
    current: CommentView[],
    mutations: CommentSyncMutation[],
  ) {
    return applyPendingMutations(
      current,
      mutations,
      bookId,
      userId,
      authorName,
      authorPhotoUrl,
      syncingIds,
    );
  }

  async function storeMutation(mutation: CommentSyncMutation) {
    if (!userId) return false;
    try {
      await putPendingCommentMutation(userId, bookId, mutation);
      const queue = await getPendingCommentMutations(userId, bookId);
      setPendingMutations(queue);
      pendingCountRef.current = queue.length;
      setComments((previous) => applyCurrentMutations(previous, queue));
      setOutboxError(null);
      if (queue.length >= SYNC_THRESHOLD) {
        void flushRef.current(false);
      }
      return true;
    } catch (error) {
      setOutboxError(
        error instanceof Error
          ? error.message
          : "The comment could not be saved on this device.",
      );
      return false;
    }
  }

  async function submitRootComment() {
    const body = rootDraft.trim();
    if (!body || body.length > COMMENT_MAX_LENGTH || !userId || isPosting) return;
    setIsPosting(true);
    const now = new Date().toISOString();
    const id = createId();
    const mutation: CommentSyncMutation = {
      mutationId: createId(),
      id,
      operation: "create",
      rootId: id,
      parentId: null,
      body,
      clientCreatedAt: now,
      queuedAt: now,
    };
    if (await storeMutation(mutation)) setRootDraft("");
    setIsPosting(false);
  }

  async function submitReply() {
    const body = replyDraft.trim();
    if (
      !body ||
      body.length > COMMENT_MAX_LENGTH ||
      !userId ||
      !replyTarget ||
      isPosting
    ) {
      return;
    }
    setIsPosting(true);
    const now = new Date().toISOString();
    const id = createId();
    const mutation: CommentSyncMutation = {
      mutationId: createId(),
      id,
      operation: "create",
      rootId: replyTarget.rootId,
      parentId: replyTarget.id,
      body,
      clientCreatedAt: now,
      queuedAt: now,
    };
    if (await storeMutation(mutation)) {
      setReplyDraft("");
      setReplyTarget(null);
      setExpandedRoots((previous) => new Set([...previous, mutation.rootId]));
      setLoadedReplyRoots((previous) => new Set([...previous, mutation.rootId]));
    }
    setIsPosting(false);
  }

  async function saveEdit(comment: CommentView) {
    const body = editDraft.trim();
    if (!body || body.length > COMMENT_MAX_LENGTH || !userId) return;
    setMutatingCommentId(comment.id);
    try {
      const existing = await getPendingCommentMutation(userId, bookId, comment.id);
      const now = new Date().toISOString();
      const mutation: CommentSyncMutation = {
        mutationId: createId(),
        id: comment.id,
        operation:
          existing?.operation === "create" ? "create" : "edit",
        rootId: comment.rootId,
        parentId: comment.parentId,
        body,
        clientCreatedAt: comment.clientCreatedAt,
        queuedAt: now,
      };
      if (await storeMutation(mutation)) setEditingCommentId(null);
    } catch (error) {
      setOutboxError(
        error instanceof Error
          ? error.message
          : "The edit could not be saved on this device.",
      );
    } finally {
      setMutatingCommentId(null);
    }
  }

  async function deleteComment(comment: CommentView) {
    if (
      !userId ||
      !window.confirm("Delete this comment? Replies will remain in the thread.")
    ) {
      return;
    }
    setMutatingCommentId(comment.id);
    try {
      const existing = await getPendingCommentMutation(userId, bookId, comment.id);
      const now = new Date().toISOString();
      const mutation: CommentSyncMutation = {
        mutationId: createId(),
        id: comment.id,
        operation:
          existing?.operation === "create" ? "create" : "delete",
        rootId: comment.rootId,
        parentId: comment.parentId,
        body: "",
        clientCreatedAt: comment.clientCreatedAt,
        queuedAt: now,
        ...(existing?.operation === "create" ? { deleted: true } : {}),
      };
      await storeMutation(mutation);
      if (editingCommentId === comment.id) setEditingCommentId(null);
    } catch (error) {
      setOutboxError(
        error instanceof Error
          ? error.message
          : "The comment could not be deleted on this device.",
      );
    } finally {
      setMutatingCommentId(null);
    }
  }

  async function loadOlderComments() {
    if (!commentsCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await getBookComments(bookId, sort, commentsCursor);
      setComments((current) =>
        mergeComments(
          current,
          page.comments,
          pendingMutations,
          bookId,
          userId,
          authorName,
          authorPhotoUrl,
          syncingIds,
        ),
      );
      setCommentsCursor(page.nextCursor);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load older comments.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  async function loadReplyPage(rootId: string, cursor?: CommentCursor | null) {
    if (!userId || loadingReplies.has(rootId)) return;
    const pendingRootCreate = pendingMutations.some(
      (mutation) =>
        mutation.operation === "create" &&
        mutation.id === rootId &&
        mutation.parentId === null,
    );
    if (!cursor && pendingRootCreate) {
      setLoadedReplyRoots((previous) => new Set([...previous, rootId]));
      return;
    }

    setLoadingReplies((previous) => new Set([...previous, rootId]));
    try {
      const page = await getBookCommentReplies(bookId, rootId, cursor);
      setComments((current) =>
        mergeComments(
          current,
          page.comments,
          pendingMutations,
          bookId,
          userId,
          authorName,
          authorPhotoUrl,
          syncingIds,
        ),
      );
      setReplyCursors((previous) => ({
        ...previous,
        [rootId]: page.nextCursor,
      }));
      setLoadedReplyRoots((previous) => new Set([...previous, rootId]));
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load replies.",
      );
    } finally {
      setLoadingReplies((previous) => {
        const next = new Set(previous);
        next.delete(rootId);
        return next;
      });
    }
  }

  async function toggleReplies(root: CommentView) {
    const isExpanded = expandedRoots.has(root.id);
    if (isExpanded) {
      setExpandedRoots((previous) => {
        const next = new Set(previous);
        next.delete(root.id);
        return next;
      });
      return;
    }
    setExpandedRoots((previous) => new Set([...previous, root.id]));
    if (!loadedReplyRoots.has(root.id)) {
      await loadReplyPage(root.id);
    }
  }

  function startReply(comment: CommentView) {
    setReplyTarget({
      id: comment.id,
      rootId: comment.rootId,
      authorName: comment.authorName,
    });
    setReplyDraft("");
    setExpandedRoots((previous) => new Set([...previous, comment.rootId]));
    if (!loadedReplyRoots.has(comment.rootId)) {
      void loadReplyPage(comment.rootId);
    }
  }

  function startEditing(comment: CommentView) {
    setEditingCommentId(comment.id);
    setEditDraft(comment.body);
    setReplyTarget(null);
  }

  function renderComment(comment: CommentView, depth: number): ReactNode {
    const timeLabel = relativeTime(getCommentTime(comment));
    const pendingMutation = sortedMutations.find(
      (mutation) => mutation.id === comment.id,
    );
    const isEdited = Boolean(comment.editedAt || pendingMutation?.operation === "edit");
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
                {comment.syncStatus === "syncing"
                  ? "Syncing"
                  : "Waiting to sync"}
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
                  onClick={() => startEditing(comment)}
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
            children.map((child) => renderComment(child, depth + 1))}
        </div>
      </article>
    );
  }

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
            onClick={() => void flushRef.current(false)}
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
              {renderComment(root, 0)}
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
                orphanReplies.map((reply) => renderComment(reply, 1))}
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
