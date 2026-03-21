import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Player } from "../models/Player.js";
import { configurationError, forbiddenError, invalidStateError, notFoundError, validationError } from "../lib/errors.js";
import { requireFields } from "../lib/validation.js";

function formatUser(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email ?? null,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function getUsers(req, res, next) {
  try {
    const users = await User.find().select("username email role createdAt");
    res.status(200).json(users.map(formatUser));
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  let createdUser = null;

  try {
    requireFields(req.body, ["username", "email", "password"]);
    const { username, email, password, role } = req.body;

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = new User({ username, email: normalizedEmail, role });

    if (password) {
      user.password = password;
    }

    await user.save();
    createdUser = user;

    const player = new Player({
      userId: user._id,
      displayName: user.username,
    });
    await player.save();

    res.status(201).json(formatUser(user));
  } catch (err) {
    if (createdUser) {
      await User.findOneAndDelete({ _id: createdUser._id });
      await Player.findOneAndDelete({ userId: createdUser._id });
    }

    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      throw validationError(`${field} ja cadastrado!`);
    }

    if (err.name === "ValidationError") {
      throw validationError("Falha de validacao", Object.values(err.errors).map((error) => error.message));
    }

    next(err);
  }
}

export async function loginUser(req, res, next) {
  try {
    requireFields(req.body, ["password"]);
    const { login, email, username, password } = req.body;
    if (!login && !email && !username) {
      throw validationError("Informe login, email ou username");
    }
    const filters = [];

    if (email) filters.push({ email });
    if (username) filters.push({ username });
    if (login) {
      filters.push({ email: login }, { username: login });
    }

    const user = await User.findOne({ $or: filters }).select("+passwordHash");

    if (!user) {
      throw notFoundError("Usuario nao encontrado!");
    }

    if (!user.passwordHash) {
      throw invalidStateError("Usuario sem hash de senha cadastrado");
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      throw forbiddenError("Senha incorreta!");
    }

    if (!process.env.JWT_SECRET) {
      throw configurationError("JWT_SECRET nao configurado");
    }

    const token = jwt.sign(
      { userId: user._id.toString(), username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const isProduction = process.env.NODE_ENV === "production";

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .status(200)
      .json({ message: "Login bem-sucedido!", user: formatUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function logoutUser(req, res, next) {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    res
      .clearCookie("token", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
      })
      .status(200)
      .json({ message: "Logout realizado com sucesso!" });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin" && req.user.userId !== id) {
      throw forbiddenError("Acao nao permitida!");
    }

    const user = await User.findOneAndDelete({ _id: id });
    if (!user) {
      throw notFoundError("Usuario nao encontrado");
    }

    return res.status(200).json({
      message: `Usuario ${user.username} e seus dados relacionados foram deletados com sucesso!`,
    });
  } catch (err) {
    next(err);
  }
}

export async function findUserById(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin" && req.user.userId !== id) {
      throw forbiddenError("Acao nao permitida!");
    }

    const user = await User.findById(id).select("username email role createdAt");
    if (!user) {
      throw notFoundError("Usuario nao encontrado");
    }

    res.status(200).json(formatUser(user));
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin" && req.user.userId !== id) {
      throw forbiddenError("Acao nao permitida!");
    }

    const user = await User.findById(id);
    if (!user) {
      throw notFoundError("Usuario nao encontrado");
    }

    if (req.body.username != null) {
      const username = String(req.body.username).trim();
      const existingUser = await User.findOne({ username }).select("_id");
      if (existingUser && String(existingUser._id) !== String(user._id)) {
        throw validationError("username ja cadastrado!");
      }
      user.username = username;
    }

    const emailWasProvided = Object.prototype.hasOwnProperty.call(req.body, "email");
    if (!user.email && !emailWasProvided) {
      throw validationError("email e obrigatorio para completar o perfil");
    }

    if (emailWasProvided) {
      const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
      if (!email) {
        throw validationError("email e obrigatorio!");
      }

      const existingUser = await User.findOne({ email }).select("_id");
      if (existingUser && String(existingUser._id) !== String(user._id)) {
        throw validationError("email ja cadastrado!");
      }

      user.email = email;
    }

    await user.save();

    const player = await Player.findOne({ userId: user._id });
    if (player) {
      player.displayName = user.username;
      await player.save();
    }

    res.status(200).json(formatUser(user));
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      throw validationError(`${field} ja cadastrado!`);
    }

    if (err.name === "ValidationError") {
      throw validationError("Falha de validacao", Object.values(err.errors).map((error) => error.message));
    }

    next(err);
  }
}

export async function checkAuth(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select("username email role createdAt");

    if (!user) {
      throw forbiddenError("Nao autenticado");
    }

    res.status(200).json({ message: "Autenticado", user: formatUser(user) });
  } catch (err) {
    next(err);
  }
}

