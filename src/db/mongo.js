import mongoose from 'mongoose';

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // opções não são mais necessárias na versão nova do mongoose,
      // mas você pode passar se quiser compatibilidade
    });
    console.log('✅ Conectado ao MongoDB Atlas');
  } catch (err) {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1); // encerra a app se não conectar
  }
}
