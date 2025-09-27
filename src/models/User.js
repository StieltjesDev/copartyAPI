import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
    name: { type: String, required: [true, "Nome é Obrigatório"] },
    email: { type: String, required: [true, "Email é obrigatório"], unique: true, match: [/^\S+@\S+\.\S+$/, "Email inválido"] },
    role: { type: String, required: true, enum: ['admin', 'user'], default: 'user' },
    password: {
        type: String,
        required: [true, "Senha é obrigatória"],
        minlength: [6, "Senha precisa ter no mínimo 6 caracteres"]
    }
}, { timestamps: true });

userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model("User", userSchema);