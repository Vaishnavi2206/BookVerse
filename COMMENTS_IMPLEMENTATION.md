# Comments Implementation

This document describes how comments and replies are implemented in Book
Verse.

## Overview

Comments are displayed on the book details page and support:

- Root comments and nested replies
- Creating, editing, and deleting comments
- Newest/oldest sorting
- Cursor-based pagination
- Optimistic UI updates
- Offline mutation storage and automatic synchronization
- Per-comment pending, syncing, and synced states
- Keeping replies when their parent root comment is deleted

The main frontend component is
[BookComments.tsx](frontend/src/components/library/book-comments/BookComments.tsx).
Its utility helpers are in
[book-comments.utils.ts](frontend/src/components/library/book-comments/book-comments.utils.ts).
Its logic exists in custom hook
[book-comments.utils.ts](frontend/src/components/library/book-comments/hooks/useBookComment.ts).

## Frontend Types

The shared API types are in
[api.ts](frontend/src/shared/api.ts).

`BookComment` represents a comment returned by the API. It contains the
comment ID, book/thread IDs, parent and root IDs, author information, text,
timestamps, and reply count.

`CommentSyncMutation` represents a local create, edit, or delete operation:

```ts
type CommentSyncMutation = {
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
```

- `mutationId` identifies one queued mutation for acknowledgement and removal.
- `id` identifies the comment or reply.
- `rootId` identifies the root comment thread.
- `parentId` is `null` for a root comment and contains the direct parent ID
  for a reply.
- `clientCreatedAt` preserves the original client-side creation time.
- `queuedAt` records when the mutation was queued locally.

The UI adds a `syncStatus` value to comments:

```ts
type CommentStatus = "pending" | "syncing" | "synced";
```

## Comment UI

`BookComments` is rendered by
[BookDetails.tsx](frontend/src/components/book-details/BookDetails.tsx).
It manages:

- The root comment draft
- Reply targets and reply drafts
- Edit drafts
- Sorting and pagination state
- Expanded reply threads
- Pending mutations and sync errors
- Online/offline state

When a user submits a root comment or reply, the component creates a
`crypto.randomUUID()` ID for both the comment and mutation. It immediately
stores the mutation in the local outbox and renders the comment as pending.
Creating or editing is therefore visible before the server confirms it.

The component supports Enter-to-send and Shift+Enter-for-a-new-line:

- Enter submits a comment or edit.
- Shift+Enter inserts a line break.

Comment text is limited to 500 characters. A user can edit or delete only
comments that belong to their signed-in account. Deleted comments remain
visible as a deletion placeholder, while replies remain attached to the thread.

The sort control supports `newest` and `oldest`. Changing the sort reloads the
root-comment page.

## Offline Outbox

IndexedDB is used as an offline mutation outbox. Its implementation is in
[comment-outbox.ts](frontend/src/shared/comment-outbox.ts).

The database details are:

- Database: `book-verse-comment-outbox`
- Object store: `mutations`
- Compound index: `[userId, bookId]`
- Record key: `[userId, bookId, commentId]`

The record key means the latest mutation for a comment replaces older pending
mutations for that same comment. This is how local edits and deletions are
collapsed:

- Editing a locally created comment changes the pending mutation to
  `operation: "create"` with the new body.
- Deleting a locally created comment converts the mutation to a deleted
  pending create, so it is omitted from server-visible content.
- Editing or deleting an existing server comment uses `edit` or `delete`
  operations.

Pending mutations are ordered by reply dependencies first, then queue time.
This ensures a reply waits until its parent create mutation appears earlier in
the batch.

## Synchronization

The synchronization process is implemented in `BookComments.tsx`.

### Trigger Conditions

The outbox is flushed:

- After loading existing pending mutations
- When the network changes from offline to online
- When the pending mutation count reaches five
- Fifteen seconds after the oldest mutation was queued
- When the page becomes hidden or is unloading
- After a failed attempt, using exponential retry delays up to 60 seconds

The normal batch size is ten mutations. Page-hide, visibility-hide, and unload
paths use a smaller batch of five mutations with `keepalive` enabled.

### Sync Flow

1. Read pending mutations from IndexedDB for the current user and book.
2. Mark the batch's comments as `syncing`.
3. POST the mutations to `/book-comments/sync`.
4. Verify that every mutation ID in the batch is acknowledged.
5. Remove acknowledged mutations from IndexedDB.
6. Reload the outbox and mark remaining comments as pending.
7. Update root reply counts returned by the server.

If synchronization fails, the mutations remain in IndexedDB. The UI keeps the
comments visible, marks them pending or out-of-sync, and schedules a retry.

## API Endpoints

Routes are declared in
[commentRoutes.js](backend/routes/commentRoutes.js). All comment routes require
authentication.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/book-comments` | Load a page of root comments |
| `GET` | `/book-comments/replies` | Load a page of replies for a root comment |
| `POST` | `/book-comments/sync` | Synchronize create/edit/delete mutations |

The controller is in
[commentController.js](backend/controllers/commentController.js), and the
Firestore implementation is in
[commentService.js](backend/services/commentService.js).

### Loading Root Comments

`GET /book-comments` accepts:

- `bookId`
- `sort`: `newest` or `oldest`
- `limit`: 1-50; defaults to 20
- `cursorCreatedAt`
- `cursorId`

The server orders by Firestore `createdAt` and document ID. The response
contains the comment list and an optional `nextCursor`.

### Loading Replies

`GET /book-comments/replies` accepts:

- `bookId`
- `rootId`
- `limit`: 1-100; defaults to 50
- `cursorCreatedAt`
- `cursorId`

Replies are ordered oldest-first. The response includes `replyCount` for the
root comment and the next reply cursor.

## Firestore Storage

Comment data is stored in one thread document hierarchy per book:

```text
bookThreads/{base64url(bookId)}
  comments/{commentId}
    replies/{replyId}
```

The book ID is base64url-encoded only for use as the Firestore thread document
ID. Root comments are stored directly in the `comments` collection. Replies
are stored in a subcollection under their root comment.

A comment document contains:

- `bookId`
- `rootId`
- `parentId`
- `userId`
- `authorName`
- `authorPhotoUrl`
- `body`
- `isDeleted`
- `createdAt`
- `clientCreatedAt`
- `editedAt`
- `deletedAt`
- `replyCount` for root comments

Server timestamps are used for persisted `createdAt`, `editedAt`, and
`deletedAt`. The client-provided `clientCreatedAt` is retained for optimistic
ordering and display.

## Mutation Validation and Transactions

The sync endpoint accepts between 1 and 10 mutations in one request.

Before applying writes, the service validates:

- Mutation and comment ID format
- Operation type
- Creation timestamps
- Root/parent relationships
- 500-character body limits
- Non-empty text for creates and edits
- Duplicate mutation IDs or comment IDs within the batch

The mutation batch is applied in a Firestore transaction:

- Root creates require no existing root comment.
- Reply creates must reference an existing or planned root/reply.
- Reply creates increment the root comment's `replyCount`.
- Edit and delete operations must refer to comments owned by the authenticated
  user.
- If a comment ID already exists, the service verifies it belongs to the same
  user. This makes retries and duplicate client mutations safe.
- Successful mutations are acknowledged by `mutationId`.

Each transaction also returns current reply counts, allowing the frontend to
update root-comment metadata without a separate request.

## Deleted Comment Behavior

Deleting a comment:

- Clears the stored `body`
- Sets `isDeleted`
- Sets `deletedAt`
- Keeps the comment document and its replies in Firestore

API serialization replaces deleted comment text with an empty string. The UI
shows `Comment deleted` and does not allow editing or deleting that placeholder
again.

## Local and Server Merge

[book-comments.utils.ts](frontend/src/components/library/book-comments/book-comments.utils.ts)
contains merge helpers:

- `mergeComments` combines server-loaded comments with currently visible
  comments.
- Pending mutations are reapplied after server responses.
- Local pending state takes precedence over stale server data.
- Comments are ordered by `clientCreatedAt`/`createdAt`, then by ID.
- Relative timestamps are calculated from the client creation time.

This prevents an offline-created comment from disappearing when paginated data
or replies are reloaded before synchronization finishes.
