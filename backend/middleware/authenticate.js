const { auth } = require("../services/firestoreService");

async function authenticate(req, res, next) {
  const authorization = req.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "A Firebase ID token is required." });
    return;
  }

  try { 
    req.user = await auth.verifyIdToken(token);
    next();
  } catch (error) {
    console.error("Firebase ID token verification failed.", error);
    res.status(401).json({ error: "The Firebase ID token is invalid or expired." });
  }
}

module.exports = authenticate;
