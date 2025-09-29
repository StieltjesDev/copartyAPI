import { userData } from "../function/user.js";
import { Deck } from "../models/Deck.js";

export async function getDecks(req, res, next) {
  try {
    const decks = await Deck.find();
    res.json(decks).status(200);
  } catch (err) {
    next(err);
  }
}

export async function createDeck(req, res, next) {
  try {
    const { id } = req.params;
    const user = userData(req.cookies.token);

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    const deck = new Deck(req.body);
    await deck.save();

    return res.status(201).json({
      id: deck._id,
      commander: deck.commander,
      link: deck.link,
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
