import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { configurationError, forbiddenError, notFoundError } from "../lib/errors.js";

export function authenticateToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return next(forbiddenError("Token nao fornecido"));
  }

  if (!process.env.JWT_SECRET) {
    return next(configurationError("JWT_SECRET nao configurado"));
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return next(forbiddenError("Token invalido"));
  }
}

export async function authorizeAdmin(req, res, next) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      throw forbiddenError("Nao autenticado");
    }

    const user = await User.findById(userId).select("role");

    if (!user) {
      throw notFoundError("Usuario nao encontrado");
    }

    if (user.role !== "admin") {
      throw forbiddenError("Acesso negado!");
    }

    next();
  } catch (error) {
    next(error);
  }
}
