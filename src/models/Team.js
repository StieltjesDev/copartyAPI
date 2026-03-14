import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event e obrigatorio"],
    },
    name: {
      type: String,
      required: [true, "Nome e obrigatorio"],
      trim: true,
      maxlength: [80, "Nome precisa ter no maximo 80 caracteres"],
    },
  },
  { timestamps: true }
);

teamSchema.index({ eventId: 1, name: 1 }, { unique: true });

export const Team = mongoose.model("Team", teamSchema);
