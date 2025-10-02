import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
    points: { type: Number },
    win: { type: Number },
    losse: { type: Number },
    tie: { type: Number },
    idUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, "Usuário é obrigatório"]
    },
    idEvent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: [true, "Event é obrigatório"]
    },
    idDeck: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deck',
        required: [true, "Deck é obrigatório"]
    }
}, { timestamps: true });


export const Player = mongoose.model("Player", playerSchema);
