import { Router } from "express";
import { pingDatabase } from "../db/client.js";
const healthRouter = Router();
healthRouter.get("/health", async (_req, res) => {
    try {
        await pingDatabase();
        res.json({
            status: "ok",
            service: "backend-node",
            version: "v1-db"
        });
    }
    catch {
        res.status(503).json({
            status: "degraded",
            service: "backend-node",
            version: "v1-db",
            db: "unreachable"
        });
    }
});
export { healthRouter };
