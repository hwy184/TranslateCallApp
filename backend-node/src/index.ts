import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startRoomGcLoop } from "./services/room-gc.js";

const app = createApp();
const stopRoomGcLoop = startRoomGcLoop();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on :${env.PORT}`);
});

process.on("SIGINT", () => {
  stopRoomGcLoop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopRoomGcLoop();
  process.exit(0);
});
