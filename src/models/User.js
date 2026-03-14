import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { USER_ROLES } from "./constants.js";
import { Deck } from "./Deck.js";
import { Player } from "./Player.js";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username e obrigatorio"],
      trim: true,
      minlength: [3, "Username precisa ter no minimo 3 caracteres"],
      maxlength: [30, "Username precisa ter no maximo 30 caracteres"],
      unique: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Email invalido"],
    },
    passwordHash: {
      type: String,
      required: function isPasswordHashRequired() {
        return !this._plainPassword;
      },
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      default: "user",
    },
  },
  { timestamps: true }
);

userSchema.virtual("name")
  .get(function getName() {
    return this.username;
  })
  .set(function setName(value) {
    this.username = value;
  });

userSchema.virtual("password").set(function setPassword(value) {
  this._plainPassword = value;
});

userSchema.pre("validate", function validatePasswordPresence(next) {
  if (this.isNew && !this.passwordHash && !this._plainPassword) {
    this.invalidate("passwordHash", "Password hash e obrigatorio");
  }

  next();
});

userSchema.pre("save", async function hashPassword(next) {
  if (!this._plainPassword) {
    next();
    return;
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this._plainPassword, salt);
    this._plainPassword = undefined;
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre("findOneAndDelete", async function cleanupRelatedDecks(next) {
  const userId = this.getQuery()["_id"];

  const player = await Player.findOne({ userId }).select("_id").lean();

  if (player) {
    await Deck.deleteMany({ playerId: player._id });
    await Player.deleteOne({ _id: player._id });
  }

  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  if (!candidatePassword || !this.passwordHash) {
    return false;
  }

  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User = mongoose.model("User", userSchema);
