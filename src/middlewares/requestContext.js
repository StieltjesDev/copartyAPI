import crypto from "node:crypto";

export function attachRequestContext(req, res, next) {
  req.requestId = req.headers["x-request-id"]?.toString() || crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
