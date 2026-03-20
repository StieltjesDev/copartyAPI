import mongoose from "mongoose";
import { DECK_FORMATS } from "./constants.js";

const SUPPORTED_DECK_HOSTS = ["ligamagic.com.br", "www.ligamagic.com.br", "moxfield.com", "www.moxfield.com"];

function isSupportedDeckLink(link) {
  if (!link) {
    return true;
  }

  try {
    const url = new URL(link);
    if (!SUPPORTED_DECK_HOSTS.includes(url.hostname)) {
      return false;
    }

    if (url.hostname.includes("moxfield.com")) {
      return url.pathname.startsWith("/decks/");
    }

    return url.searchParams.get("view") === "dks/deck" && url.searchParams.has("id");
  } catch {
    return false;
  }
}

const deckSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: [true, "Player e obrigatorio"],
    },
    name: {
      type: String,
      required: [true, "Nome e obrigatorio"],
      trim: true,
      maxlength: [80, "Nome precisa ter no maximo 80 caracteres"],
    },
    commander: {
      type: String,
      trim: true,
      maxlength: [80, "Commander precisa ter no maximo 80 caracteres"],
    },
    format: {
      type: String,
      required: [true, "Format e obrigatorio"],
      enum: DECK_FORMATS,
    },
    link: {
      type: String,
      trim: true,
      maxlength: [500, "Link precisa ter no maximo 500 caracteres"],
      validate: {
        validator: isSupportedDeckLink,
        message: "Link precisa ser um deck da LigaMagic ou do Moxfield",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

deckSchema.index({ playerId: 1, isActive: 1 });

export const Deck = mongoose.model("Deck", deckSchema);
