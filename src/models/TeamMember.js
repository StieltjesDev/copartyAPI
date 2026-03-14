import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Team e obrigatorio"],
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: [true, "Player e obrigatorio"],
    },
  },
  { timestamps: true }
);

teamMemberSchema.index({ teamId: 1, playerId: 1 }, { unique: true });

export const TeamMember = mongoose.model("TeamMember", teamMemberSchema);
