import mongoose from 'mongoose';

export async function connectDB() {
  try {
    const { MONGO_URI } = process.env;

    if (!MONGO_URI) {
      throw new Error('MONGO_URI nao foi carregada. Verifique o arquivo src/.env e o dotenv.');
    }

    await mongoose.connect(MONGO_URI);
    console.log('Conectado ao MongoDB Atlas');
  } catch (err) {
    console.error('Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  }
}
