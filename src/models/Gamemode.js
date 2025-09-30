import mongoose from 'mongoose';

const gamemodeSchema = new mongoose.Schema({
    name: { type: String, required: [true, "Nome é obrigatorio"] },
}, { timestamps: true });


export const Gamemode = mongoose.model("Gamemode", gamemodeSchema);
