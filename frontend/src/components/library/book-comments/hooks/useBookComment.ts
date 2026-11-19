import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../../context/AuthContext";
import {
  getBookCommentReplies,
  getBookComments,
  syncBookComments,
  type CommentCursor,
  type CommentSyncMutation,
} from "../../../../shared/api";
import {
  getPendingCommentMutations,
  getPendingCommentMutation,
  putPendingCommentMutation,
  removeAcknowledgedCommentMutations,
} from "../../../../shared/comment-outbox";
import {
  COMMENT_MAX_LENGTH,
  type CommentView,
  type ReplyTarget,
  createId,
  compareComments,
  asCommentView,
  applyPendingMutations,
  mergeComments,
} from "../book-comments.utils";

type CommentStatus = CommentView["syncStatus"];

const SYNC_THRESHOLD = 5;
const SYNC_DELAY_MS = 15_000;
const SYNC_BATCH_SIZE = 10;

export function useBookComments({ bookId }: { bookId: string }) {
    const [comments, setComments] = useState<CommentView[]>([]);
    const [syncingMutationIds, setSyncingMutationIds] = useState<Set<string>>(
      new Set(),
    );
    const [sort, setSort] = useState<"newest" | "oldest">("newest");
    const [commentsCursor, setCommentsCursor] = useState<CommentCursor | null>(
      null,
    );
const [mutatingCommentId, setMutatingCommentId] = useState<string | null>(
  null
);
  const { uiUser } = useAuth();
  const userId = uiUser?.userId ?? "";
  const authorName =
    uiUser?.displayName || uiUser?.email || "Book Verse reader";
  const authorPhotoUrl = uiUser?.photoUrl ?? null;
  const [pendingMutations, setPendingMutations] = useState<
    CommentSyncMutation[]
  >([]);
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

  const flushComments = useCallback(
    async (keepalive = false) => {
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
            throw new Error(
              "Some comments were not acknowledged by the server.",
            );
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
          error instanceof Error
            ? error.message
            : "Comments could not be synced.",
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
    },
    [bookId, retryDelay, userId],
  );

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
      pendingMutations
        .slice()
        .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt)),
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
    if (!body || body.length > COMMENT_MAX_LENGTH || !userId || isPosting)
      return;
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
      setLoadedReplyRoots(
        (previous) => new Set([...previous, mutation.rootId]),
      );
    }
    setIsPosting(false);
  }

  async function saveEdit(comment: CommentView) {
    const body = editDraft.trim();
    if (!body || body.length > COMMENT_MAX_LENGTH || !userId) return;
    setMutatingCommentId(comment.id);
    try {
      const existing = await getPendingCommentMutation(
        userId,
        bookId,
        comment.id,
      );
      const now = new Date().toISOString();
      const mutation: CommentSyncMutation = {
        mutationId: createId(),
        id: comment.id,
        operation: existing?.operation === "create" ? "create" : "edit",
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
      const existing = await getPendingCommentMutation(
        userId,
        bookId,
        comment.id,
      );
      const now = new Date().toISOString();
      const mutation: CommentSyncMutation = {
        mutationId: createId(),
        id: comment.id,
        operation: existing?.operation === "create" ? "create" : "delete",
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
        error instanceof Error
          ? error.message
          : "Unable to load older comments.",
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

  return {
    flushComments,
    isOnline,
    isSyncing,
    comments,
    pendingMutations,
    syncingIds,
    sort,
    setSort,
    commentsCursor,
    replyCursors,
    expandedRoots,
    loadingReplies,
    loading,
    loadingOlder,
    rootComments,
    sortedMutations,
    storeMutation,
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
    deleteComment,
    loadOlderComments,
    loadReplyPage,
    toggleReplies,
    startReply,
    syncError,
    outboxError,
    loadError,
    isPosting,
    mutatingCommentId,
  };
}
