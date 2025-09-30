import mongoose from 'mongoose';

const eventsStatsSchema = new mongoose.Schema({
    idUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, "User é obrigatório"]
    },
    idEvent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: [true, "Event é obrigatório"]
    },
    idPlayer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        required: [true, "Player é obrigatório"]
    },
    idDeck: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deck',
        required: [true, "Deck é obrigatório"]
    },
}, { timestamps: true });


export const EventsStats = mongoose.model("EventsStats", eventsStatsSchema);
