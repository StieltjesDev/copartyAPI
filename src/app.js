import express from 'express';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import cookieParser from 'cookie-parser';
import { connectDB } from './db/mongo.js';
import cors from 'cors'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: 'http://localhost:5173', 
    credentials: true,               
  })
)
app.use(express.json());
app.use(cookieParser());
// rotas
app.use('/api', routes);

// erro
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// conecta ao banco antes de subir servidor
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server rodando em http://localhost:${PORT}`);
  });
});
