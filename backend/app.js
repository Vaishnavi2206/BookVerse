const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const cors = require("cors");
const express = require("express");
const { HttpError } = require("./services/firestoreService");
const libraryRoutes = require("./routes/libraryRoutes");
const collectionRoutes = require("./routes/collectionRoutes");
const commentRoutes = require("./routes/commentRoutes");

const app = express();
const port = Number(process.env.PORT ?? 3000);
const configuredOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isLocalDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      callback(
        null,
        !origin ||
          configuredOrigins.includes(origin) ||
          isLocalDevelopmentOrigin(origin),
      );
    },
  }),
);
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(libraryRoutes);
app.use(collectionRoutes);
app.use(commentRoutes);

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "The request body must be valid JSON." });
    return;
  }

  console.error("API request failed.", error);
  res.status(500).json({ error: "The request could not be completed." });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Book Verse API listening on port ${port}`);
  });
}

module.exports = app;
