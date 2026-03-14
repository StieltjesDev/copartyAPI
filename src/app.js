import express from "express";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import { attachRequestContext } from "./middlewares/requestContext.js";
import "./models/index.js";

dotenv.config({ path: new URL("./.env", import.meta.url) });

export function createApp() {
  const app = express();
  const origin = process.env.ORIGIN || "http://localhost:5173";

  app.use(
    cors({
      origin,
      credentials: true,
    })
  );
  app.use(attachRequestContext);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);

  app.use((err, req, res, next) => {
    const status = err.status || 500;
    const code = err.code || (status === 400
      ? "VALIDATION_ERROR"
      : status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "INVALID_STATE"
            : "INTERNAL_ERROR");

    res.status(status).json({
      error: {
        code,
        message: err.message || "Erro interno",
        details: err.details ?? null,
      },
    });
  });

  return app;
}
