import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LIVEKIT_URL: z.string().min(1).default(""),
  LIVEKIT_API_KEY: z.string().min(1).default(""),
  LIVEKIT_API_SECRET: z.string().min(1).default(""),
  WORKER_INTERNAL_URL: z.string().url().default("http://worker:8090"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@postgres:5432/voice_translation")
});

export const env = envSchema.parse(process.env);
