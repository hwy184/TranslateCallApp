import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
export function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
    return { hash, salt };
}
export function verifyPassword(password, salt, storedHash) {
    const inputHash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
    return timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"));
}
