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

export async function findDecksByUserId(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id ? req.params.id : user.userId;

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    const deck = await Deck.find({ idUser: id });
    if (!deck) return res.status(404).json({ error: "Nenhum deck encontrado" });
    res.json(deck).status(200);
  } catch (err) {
    next(err);
  }
}

export async function createDeck(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id ? req.params.id : user.userId;

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    req.body.idUser = id;
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

export async function putDeck(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id;
    if (!id)
      return res.status(400).json({ error: "ID do deck é obrigatório!" });
    delete req.body.idUser; // previne mudança de dono do deck

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    const deck = await Deck.up(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!deck) return res.status(404).json({ error: "Deck não encontrado" });
    return res.json(deck).status(200);
  } catch (err) {
    next(err);
  }
}

export async function deleteDeck(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id;
    if (!id)
      return res.status(400).json({ error: "ID do deck é obrigatório!" });

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    const deck = await Deck.findByIdAndDelete(id);
    if (!deck) return res.status(404).json({ error: "Deck não encontrado" });
    return res.json({ message: "Deck deletado com sucesso!" }).status(200);
  } catch (err) {
    next(err);
  }
}
