const express = require("express");
const authenticate = require("../middleware/authenticate");
const libraryController = require("../controllers/libraryController");

const router = express.Router();

router.get("/library", authenticate, libraryController.getLibrary);
router.get("/library-state", authenticate, libraryController.getLibraryState);
router.post("/add-to-library", authenticate, libraryController.addToLibrary);

module.exports = router;
