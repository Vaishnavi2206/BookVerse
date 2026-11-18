const libraryService = require("../services/collectionService");

async function getCollections(req, res, next) {
  try {
    res.json({ collections: await libraryService.getCollections(req.user.uid) });
  } catch (error) {
    next(error);
  }
}

async function getPublicCollections(_req, res, next) {
  try {
    res.json({ collections: await libraryService.getPublicCollections() });
  } catch (error) {
    next(error);
  }
}

async function saveCollection(req, res, next) {
  try {
    const collection = await libraryService.saveCollection(
      req.user.uid,
      req.params.collectionId,
    );
    res.json({ success: true, collection });
  } catch (error) {
    next(error);
  }
}

async function setCollectionLike(req, res, next) {
  try {
    const result = await libraryService.setCollectionLike(
      req.user.uid,
      req.params.collectionId,
      req.body?.liked,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function removeBookFromCollection(req, res, next) {
  try {
    const result = await libraryService.removeBookFromCollection(
      req.user.uid,
      req.params.collectionId,
      req.body?.bookId,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCollections,
  getPublicCollections,
  saveCollection,
  setCollectionLike,
  removeBookFromCollection,
};
