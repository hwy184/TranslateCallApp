import { Router } from "express";

const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "backend-node",
    version: "v1-skeleton"
  });
});

export { healthRouter };
