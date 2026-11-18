# Book Verse API

The API uses Firebase Admin credentials from Application Default Credentials.
For local development, create `backend/.env` with `FIREBASE_PROJECT_ID` set to
the same Firebase project used by the frontend and `GOOGLE_APPLICATION_CREDENTIALS`
set to the path of a service-account JSON file outside the repository. The
service account needs Firestore access. The API also accepts
`GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT` as the project ID when
`FIREBASE_PROJECT_ID` is unset. `PORT` defaults to `3000`, and
`FRONTEND_ORIGIN` defaults to `http://localhost:5173`. In development, HTTP
requests from `localhost` and `127.0.0.1` are accepted on any port. In
production, set `FRONTEND_ORIGIN` to the exact frontend origin or a
comma-separated list of allowed origins.

Run the API with `npm run dev`. Set the frontend's `VITE_API_BASE_URL` to the
API origin if it is not `http://localhost:3000`.

All write and private collection routes require a Firebase ID token in the
`Authorization: Bearer ...` header. The API verifies the token and checks the
request `userId` against the authenticated Firebase UID.

Routes:

- `POST /add-to-library` saves library fields and the selected collection
  memberships. It can also create a collection in the same Firestore transaction.
- `GET /library` restores the signed-in user's library and collection IDs.
- `GET /library-state` returns the library, owned collections, and public
  collections in one authenticated request for the frontend's initial state.
- `GET /collections` lists the signed-in user's collections and their items.
- `GET /public-collections` lists public collections and their items.
- `DELETE /collections/:collectionId/books` removes a book from one collection;
  the library entry itself remains.

Library records use `library/{userId}_{base64url(bookId)}` so the same book can
be saved independently by multiple users. Collections use
`collections/{collectionId}`, include an `ownerId`, and store memberships in
`items/{base64url(bookId)}`. Private library fields and the book-list metadata
are kept separate.