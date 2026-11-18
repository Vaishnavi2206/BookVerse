const express = require("express");
const authenticate = require("../middleware/authenticate");
const collectionController = require("../controllers/collectionController");

const router = express.Router();

router.get("/collections", authenticate, collectionController.getCollections);
router.get("/public-collections", collectionController.getPublicCollections);
router.post(
  "/collections/:collectionId/save",
  authenticate,
  collectionController.saveCollection,
);
router.put(
  "/collections/:collectionId/like",
  authenticate,
  collectionController.setCollectionLike,
);
router.delete(
  "/collections/:collectionId/books",
  authenticate,
  collectionController.removeBookFromCollection,
);

module.exports = router;
