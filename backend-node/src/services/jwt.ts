import { createHmac, timingSafeEqual } from "node:crypto";

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
}

export function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest();
  return `${unsigned}.${base64url(signature)}`;
}

export function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", secret).update(unsigned).digest();
  const actualSignature = fromBase64url(encodedSignature);
  if (actualSignature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(actualSignature, expectedSignature)) return null;

  try {
    const payloadRaw = fromBase64url(encodedPayload).toString("utf8");
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    return payload;
  } catch {
    return null;
  }
}
