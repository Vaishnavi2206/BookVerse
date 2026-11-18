const libraryService = require("../services/libraryService");

async function getLibrary(req, res, next) {
  try {
    res.json({ library: await libraryService.getLibrary(req.user.uid) });
  } catch (error) {
    next(error);
  }
}

async function getLibraryState(req, res, next) {
  try {
    res.json(await libraryService.getLibraryState(req.user.uid));
  } catch (error) {
    next(error);
  }
}

async function addToLibrary(req, res, next) {
  try {
    res.status(200).json(
      await libraryService.addToLibrary(req.user.uid, req.body),
    );
  } catch (error) {
    next(error);
  }
}

module.exports = { addToLibrary, getLibrary, getLibraryState };
