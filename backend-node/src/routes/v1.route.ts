import { Router } from "express";

const v1Router = Router();

const notImplemented = (feature: string) => ({
  error: "not_implemented",
  message: `${feature} is scaffolded and will be implemented in next tasks`
});

v1Router.post("/auth/guest", (_req, res) => {
  res.status(501).json(notImplemented("POST /auth/guest"));
});

v1Router.post("/auth/login", (_req, res) => {
  res.status(501).json(notImplemented("POST /auth/login"));
});

v1Router.post("/auth/logout", (_req, res) => {
  res.status(501).json(notImplemented("POST /auth/logout"));
});

v1Router.post("/rooms", (_req, res) => {
  res.status(501).json(notImplemented("POST /rooms"));
});

v1Router.post("/rooms/join", (_req, res) => {
  res.status(501).json(notImplemented("POST /rooms/join"));
});

v1Router.post("/rooms/:roomId/end", (_req, res) => {
  res.status(501).json(notImplemented("POST /rooms/{roomId}/end"));
});

v1Router.patch("/rooms/:roomId/participants/:participantId/settings", (_req, res) => {
  res.status(501).json(notImplemented("PATCH /rooms/{roomId}/participants/{participantId}/settings"));
});

v1Router.get("/history", (_req, res) => {
  res.status(501).json(notImplemented("GET /history"));
});

v1Router.delete("/history/:id", (_req, res) => {
  res.status(501).json(notImplemented("DELETE /history/{id}"));
});

v1Router.put("/me/preferences/voice", (_req, res) => {
  res.status(501).json(notImplemented("PUT /me/preferences/voice"));
});

v1Router.post("/translate/text", (_req, res) => {
  res.status(501).json(notImplemented("POST /translate/text"));
});

v1Router.post("/internal/worker/events", (_req, res) => {
  res.status(501).json(notImplemented("POST /internal/worker/events"));
});

export { v1Router };
