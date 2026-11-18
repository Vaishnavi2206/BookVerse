const express = require("express");
const authenticate = require("../middleware/authenticate");
const commentController = require("../controllers/commentController");

const router = express.Router();

router.get("/book-comments/replies", authenticate, commentController.getBookCommentReplies);
router.get("/book-comments", authenticate, commentController.getBookComments);
router.post("/book-comments/sync", authenticate, commentController.syncBookComments);

module.exports = router;
