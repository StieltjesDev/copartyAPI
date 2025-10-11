import mongoose from 'mongoose';

const deckSchema = new mongoose.Schema({
    name: { type: String, required: [true, "Nome é obrigatório"]},
    link: { type: String, required: [true, "Link é Obrigatório."] },
    commander: { type: String },
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
