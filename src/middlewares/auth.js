import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export function authenticateToken(req, res, next) {
  const token = req.cookies?.token; // pega o cookie chamado "token"

  if (!token) return res.status(401).json({ error: "Token não fornecido" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido" });
    req.user = user;
    next();
  });
}

export async function authorizeAdmin(req, res, next) {
  try {
    const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado!" });
    }

    next();

  } catch (e) {
    return res.status(403).json({ error: "Token inválido", message: e.message});
  }
}
