import cors from "cors";
import express from "express";
import type { HealthResponse } from "@chatquest/shared";
import { AdventureConflictError, AdventureInputError, SqliteAdventureStore, type AdventureStore } from "./adventureStore.js";
import { serverConfig, type ServerConfig } from "./config.js";

export function createApp(
  adventureStore: AdventureStore = new SqliteAdventureStore(":memory:"),
  config: ServerConfig = serverConfig
) {
  const app = express();

  app.use(cors({ origin: config.webOrigin }));
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_request, response) => {
    const body: HealthResponse = {
      status: "ok",
      service: "chatquest-server",
      timestamp: new Date().toISOString()
    };

    response.json(body);
  });

  app.get("/api/twitch/status", (_request, response) => {
    const configured = Boolean(config.twitch.clientId && config.twitch.clientSecret && config.twitch.redirectUri);
    response.json({ connected: false, configured, message: configured ? "Twitch credentials are present, but the OAuth flow is not implemented yet." : "Set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and TWITCH_REDIRECT_URI in the server environment before connecting." });
  });

  app.post("/api/auth/twitch", (_request, response) => {
    if (!config.twitch.clientId || !config.twitch.clientSecret || !config.twitch.redirectUri) {
      response.status(503).json({ error: "Twitch OAuth is unavailable until TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and TWITCH_REDIRECT_URI are configured on the server." });
      return;
    }
    response.status(501).json({ error: "Twitch OAuth flow is not implemented yet." });
  });

  app.get("/api/adventure", (_request, response) => response.json(adventureStore.getCurrent()));
  app.get("/api/adventure/history", (_request, response) => response.json(adventureStore.getHistory()));

  app.post("/api/adventure/create", (_request, response) => {
    response.status(201).json(adventureStore.create());
  });

  app.post("/api/adventure/vote", (request, response) => {
    const choiceId = request.body?.choiceId;
    try {
      response.json(adventureStore.recordVote(choiceId));
    } catch (error) {
      if (error instanceof AdventureConflictError) response.status(409).json({ error: error.message });
      else if (error instanceof AdventureInputError) response.status(400).json({ error: error.message });
      else throw error;
    }
  });

  app.post("/api/adventure/:action", (request, response) => {
    try {
      response.json(adventureStore.transition(request.params.action));
    } catch (error) {
      if (error instanceof AdventureConflictError) response.status(409).json({ error: error.message });
      else throw error;
    }
  });

  return app;
}
