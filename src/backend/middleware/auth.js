import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "pi-server-dev-secret-change-in-prod";

export function generateToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
