const commentService = require("../services/commentService");

async function getBookComments(req, res, next) {
  try {
    res.json(
      await commentService.getBookComments(req.query.bookId, {
        sort: req.query.sort,
        limit: req.query.limit,
        cursorCreatedAt: req.query.cursorCreatedAt,
        cursorId: req.query.cursorId,
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function getBookCommentReplies(req, res, next) {
  try {
    res.json(
      await commentService.getBookCommentReplies(
        req.query.bookId,
        req.query.rootId,
        {
          limit: req.query.limit,
          cursorCreatedAt: req.query.cursorCreatedAt,
          cursorId: req.query.cursorId,
        },
      ),
    );
  } catch (error) {
    next(error);
  }
}

async function syncBookComments(req, res, next) {
  try {
    res.status(200).json(
      await commentService.syncBookComments(
        req.user.uid,
        req.body?.bookId,
        req.body?.mutations,
      ),
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBookCommentReplies,
  getBookComments,
  syncBookComments,
};
