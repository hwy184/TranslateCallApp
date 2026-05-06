import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { registerRoutes } from "./routes/index.js";
function createCorsMiddleware() {
    return cors({
        origin(origin, callback) {
            // Native mobile requests and same-origin server calls can come without Origin.
            if (!origin) {
                callback(null, true);
                return;
            }
            if (env.CORS_ALLOWED_ORIGINS_LIST.length === 0) {
                callback(null, env.NODE_ENV !== "production");
                return;
            }
            callback(null, env.CORS_ALLOWED_ORIGINS_LIST.includes(origin));
        }
    });
}
function createRateLimiter(max) {
    return rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            error: {
                code: "RATE_LIMITED",
                message: "Too many requests. Please retry later."
            }
        }
    });
}
export function createApp() {
    const app = express();
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
    app.use(helmet());
    app.use(createCorsMiddleware());
    app.use(express.json({ limit: "2mb" }));
    app.use("/api/v1/auth", createRateLimiter(env.RATE_LIMIT_AUTH_MAX));
    app.use("/api/v1/rooms", createRateLimiter(env.RATE_LIMIT_ROOMS_MAX));
    app.use("/api/v1", rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max: env.RATE_LIMIT_GLOBAL_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => req.path.startsWith("/internal/worker/events"),
        message: {
            error: {
                code: "RATE_LIMITED",
                message: "Too many requests. Please retry later."
            }
        }
    }));
    registerRoutes(app);
    app.use(errorHandler);
    return app;
}
