import mongoose from 'mongoose';

const deckSchema = new mongoose.Schema({
    commander: { type: String, required: [true, "Comandante é obrigatório"] },
    link: { type: String, required: [true, "Link é Obrigatório."] },
    win: { type: Number },
    losse: { type: Number },
    tie: { type: Number },
    idUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, "Usuário é obrigatório"]
    },
}, { timestamps: true });


export const Deck = mongoose.model("Deck", deckSchema);
