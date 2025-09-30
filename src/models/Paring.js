import mongoose from 'mongoose';

const paringSchema = new mongoose.Schema({
    name: { type: String, required: [true, "Nome é obrigatorio"] },
}, { timestamps: true });


export const Paring = mongoose.model("Paring", paringSchema);
