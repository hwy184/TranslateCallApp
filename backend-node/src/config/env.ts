import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  ROOM_LOCK_MINUTES: z.coerce.number().int().min(1).max(180).default(15),
  LIVEKIT_URL: z.string().default(""),
  LIVEKIT_API_KEY: z.string().default(""),
  LIVEKIT_API_SECRET: z.string().default(""),
  JWT_SECRET: z.string().min(16).default("change-me-super-secret-key"),
  WORKER_INTERNAL_SECRET: z.string().min(12).default("change-me-worker-secret"),
  WORKER_INTERNAL_URL: z.string().url().default("http://worker:8000"),
  WORKER_INTERNAL_URLS: z.string().default(""),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@postgres:5432/voice_translation")
});

export const env = envSchema.parse(process.env);
