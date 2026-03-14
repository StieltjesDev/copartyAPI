import { createApp } from "./app.js";
import { connectDB } from "./db/mongo.js";

const app = createApp();
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server rodando em http://localhost:${PORT}`);
  });
});
