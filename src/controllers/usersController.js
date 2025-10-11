import { User } from "../models/User.js";
import jwt from "jsonwebtoken";
import { userData } from "../function/user.js";

export async function getUsers(req, res, next) {
  try {
    const users = await User.find();
    res.json(users).status(200);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const user = new User(req.body);
    await user.save();

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    // Verifica erro de duplicidade (MongoDB code 11000)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0]; // campo duplicado
      return res.status(400).json({ error: `${field} já cadastrado!` });
    }

    // Erros de validação do schema
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ errors: messages });
    }

    next(err);
  }
}

export async function loginUser(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Usuário não encontrado!" });

    const isValid = await user.comparePassword(password);
    if (!isValid) return res.status(400).json({ error: "Senha incorreta!" });
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // enviar token como cookie seguro
    res
      .cookie("token", token, {
        httpOnly: true, // front-end não consegue acessar via JS
        secure: process.env.NODE_ENV === "production", // só https
        sameSite: "strict", // proteção CSRF básica
        maxAge: 24 * 60 * 60 * 1000, // 1 dia
      })
      .json({ message: "Login bem-sucedido!" })
      .status(200);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const userD = userData(req.cookies.token);
    if (userD.role !== "admin" && userD.userId !== id ) return res.status(403).json({ error: "Ação não permitida!" });
    
    const user = await User.findOneAndDelete({ _id: id });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    return res
      .status(200)
      .json({
        message: `Usuário ${user.name} e seus dados relacionados foram deletados com sucesso!`,
      });
  } catch (err) {
    next(err);
  }
}

export async function findUserById(req, res, next) {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password"); // não retornar a senha
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json(user).status(200);
  } catch (err) {
    next(err);
  }
}

export async function checkAuth(req, res, next) {
  try {
    const userD = userData(req.cookies.token);
    if (!userD) return res.status(401).json({ error: "Não autenticado" });
    res.status(200).json({ message: "Autenticado" });
  } catch (err) {
    next(err);
  }
}
