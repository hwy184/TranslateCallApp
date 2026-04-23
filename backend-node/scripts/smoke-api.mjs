const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000/api/v1";

async function request(path, options = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.headers) {
    const extra = new Headers(options.headers);
    for (const [key, value] of extra.entries()) {
      headers.set(key, value);
    }
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function run() {
  const stamp = Date.now();
  const email = `smoke_${stamp}@example.com`;
  const password = "Passw0rd!123";

  const register = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, display_name: "Smoke User" }),
  });
  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const userId = register?.user?.userId ?? register?.user?.user_id;
  if (!userId) {
    throw new Error(`register_response_missing_user_id: ${JSON.stringify(register)}`);
  }
  const room = await request("/rooms", {
    method: "POST",
    body: JSON.stringify({
      host_user_id: userId,
      host_identity: `host_${stamp}`,
      host_display_name: "Smoke Host",
      host_settings: { source_language: "vi", target_language: "en", voice_profile: "host-default" },
      supported_languages: ["vi", "en"],
    }),
    headers: { authorization: `Bearer ${login.session.accessToken}` },
  });

  const resolved = await request(`/rooms/resolve/${room.room_short_code}`);
  await request(`/rooms/${room.room.roomId}/status`);
  await request(`/rooms/${room.room.roomId}/end`, { method: "POST" });

  // history delete-all should always work even when empty
  await request("/history", { method: "DELETE" });

  console.log(
    JSON.stringify(
      {
        ok: true,
        registeredUser: userId,
        roomId: room.room.roomId,
        roomCode: room.room_short_code,
        resolvedRoomId: resolved.room.roomId,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error("[smoke] failed:", error.message);
  process.exit(1);
});
