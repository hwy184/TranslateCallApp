import { env } from "../config/env.js";
import { signHs256 } from "./jwt.js";

interface CreateLivekitTokenInput {
  identity: string;
  name: string;
  room: string;
  metadata: Record<string, unknown>;
}

export function createLivekitToken(input: CreateLivekitTokenInput): string | null {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: env.LIVEKIT_API_KEY,
    sub: input.identity,
    nbf: now,
    exp: now + 60 * 60,
    name: input.name,
    metadata: JSON.stringify(input.metadata),
    video: {
      roomJoin: true,
      room: input.room,
      canPublish: true,
      canSubscribe: true
    }
  };

  return signHs256(payload, env.LIVEKIT_API_SECRET);
}
