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
}, { timestamps: true });


export const Player = mongoose.model("Player", playerSchema);
