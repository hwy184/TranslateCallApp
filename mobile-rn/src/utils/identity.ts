export function generateIdentity(prefix: "host" | "guest"): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_device_android_${random}`;
}
