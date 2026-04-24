import { Router } from "express";
import { pingDatabase } from "../db/client.js";
import { env } from "../config/env.js";
const healthRouter = Router();
healthRouter.get("/health", async (_req, res) => {
    const result = {
        status: "ok",
        service: "backend-node",
        version: "v1-db-worker",
        db: "ok",
        worker: "ok"
    };
    try {
        await pingDatabase();
    }
    catch {
        result.status = "degraded";
        result.db = "unreachable";
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`${env.WORKER_INTERNAL_URL}/health`, {
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
            result.status = "degraded";
            result.worker = "unreachable";
        }
        else {
            result.worker_details = await response.json().catch(() => null);
        }
    }
    catch {
        result.status = "degraded";
        result.worker = "unreachable";
    }
    if (result.status === "ok") {
        res.json(result);
        return;
    }
    res.status(503).json(result);
});
export { healthRouter };
