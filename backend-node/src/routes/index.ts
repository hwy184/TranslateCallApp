import type { Express } from "express";
import { healthRouter } from "./health.route.js";
import { v1Router } from "./v1.route.js";

export function registerRoutes(app: Express) {
  app.use("/", healthRouter);
  app.use("/api/v1", v1Router);
}
