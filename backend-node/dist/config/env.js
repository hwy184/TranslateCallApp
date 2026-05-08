import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
    CORS_ALLOWED_ORIGINS: z.string().default(""),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_ROOMS_MAX: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(120),
    ROOM_LOCK_MINUTES: z.coerce.number().int().min(1).max(180).default(15),
    ROOM_GC_INTERVAL_MS: z.coerce.number().int().min(5_000).max(300_000).default(30_000),
    LIVEKIT_URL: z.string().default(""),
    LIVEKIT_API_KEY: z.string().default(""),
    LIVEKIT_API_SECRET: z.string().default(""),
    JWT_SECRET: z.string().min(16).default("change-me-super-secret-key"),
    WORKER_INTERNAL_SECRET: z.string().min(12).default("change-me-worker-secret"),
    WORKER_INTERNAL_URL: z.string().url().default("http://worker:8000"),
    WORKER_INTERNAL_URLS: z.string().default(""),
    DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@postgres:5432/voice_translation")
});
const parsed = envSchema.parse(process.env);
export const env = {
    ...parsed,
    CORS_ALLOWED_ORIGINS_LIST: parsed.CORS_ALLOWED_ORIGINS
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
};
