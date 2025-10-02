import { userData } from "../function/user.js";
import { Event } from "../models/Event.js";
import { Player } from "../models/Player.js";

export async function getEvents(req, res, next) {
  try {
    const events = await Event.find();
    res.json(events).status(200);
  } catch (err) {
    next(err);
  }
}

export async function findEventsByUserId(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id ? req.params.id : user.userId;

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    const event = await event.find({ idUser: id });
    if (!event)
      return res.status(404).json({ error: "Nenhum Event encontrado" });
    res.json(event).status(200);
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id ? req.params.id : user.userId;

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    req.body.idUser = id;
    const event = new Event(req.body);
    await event.save();

    return res.status(201).json({
      id: event._id,
      message: "Event criado com sucesso!",
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

export async function putEvent(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id;
    if (!id)
      return res.status(400).json({ error: "ID do Event é obrigatório!" });
    delete req.body.idUser; // previne mudança de dono do Event

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    const event = await event.up(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!event) return res.status(404).json({ error: "Event não encontrado" });
    return res.json(event).status(200);
  } catch (err) {
    next(err);
  }
}

export async function deleteEvent(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id;
    if (!id)
      return res.status(400).json({ error: "ID do Event é obrigatório!" });

    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" });

    const event = await event.findByIdAndDelete(id);
    if (!event) return res.status(404).json({ error: "Event não encontrado" });
    return res.json({ message: "Event deletado com sucesso!" }).status(200);
  } catch (err) {
    next(err);
  }
}

export async function getEventById(req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id;
    if (!id)
      return res.status(400).json({ error: "ID do Event é obrigatório!" });
    if (user.role !== "admin" && user.userId !== id)
      return res.status(403).json({ error: "Ação não permitida!" }); 
    const event = await event.findById(id);
    if (!event) return res.status(404).json({ error: "Event não encontrado" });
    return res.json(event).status(200);
  } catch (err) {
    next(err);
  }
}

export async function postEnterEvent (req, res, next) {
  try {
    const user = userData(req.cookies.token);
    const id = req.params.id;
    if (!id)
      return res.status(400).json({ error: "ID do Event é obrigatório!" });
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: "Event não encontrado" });
    if (event.dateTime < new Date())
      return res.status(400).json({ error: "Event já ocorreu" });
    if (!req.body.idDeck)
      return res.status(400).json({ error: "ID do Deck é obrigatório!" });
    const checkPlayer = await Player.findOne({ idUser: user.userId, idEvent: id });
    if (checkPlayer)
      return res.status(400).json({ error: "Usuário já inscrito no Event" });
    
    delete req.body.idUser; // previne mudança de dono do Event
    delete req.body.idEvent; // previne mudança de dono do Event
    delete req.body.points; // previne mudança de pontos
    
    const player = new Player({
      idUser: user.userId,
      idEvent: id,
      idDeck: req.body.idDeck,
      points: 0
    });

    await player.save();
    return res.json({ message: "Inscrição realizada com sucesso!" }).status(200);
    
  } catch (err) { 
    next(err);  
  }

}