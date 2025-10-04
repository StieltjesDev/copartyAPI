import mongoose from 'mongoose';

const teamPlayerSchema = new mongoose.Schema({
    idTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: [true, "Team é obrigatório"]
    },
    idPlayer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        required: [true, "Player é obrigatório"]
    }
}, { timestamps: true });


export const TeamPlayer = mongoose.model("teamPlayer", teamPlayerSchema);
