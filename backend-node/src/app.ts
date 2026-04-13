import cors from "cors";
import express from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes/index.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  registerRoutes(app);
  return app;
}
