import { createServer } from "node:http";
import { once } from "node:events";
import { Server } from "socket.io";
import { io as createClient } from "socket.io-client";
import type { ServerStatus } from "@chatquest/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { registerRealtimeHandlers } from "./realtime.js";

describe("ChatQuest server foundation", () => {
  it("reports a healthy API", async () => {
    const response = await request(createApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "chatquest-server"
    });
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });

  it("provides a local adventure preview and controls its lifecycle", async () => {
    const app = createApp();
    const initial = await request(app).get("/api/adventure");
    expect(initial.status).toBe(200);
    expect(initial.body.status).toBe("idle");
    expect(initial.body.choices).toHaveLength(3);

    const created = await request(app).post("/api/adventure/create");
    expect(created.status).toBe(201);
    expect(created.body.title).toBeTruthy();
    expect(created.body.status).toBe("idle");

    const started = await request(app).post("/api/adventure/start");
    expect(started.body.status).toBe("active");
    const paused = await request(app).post("/api/adventure/pause");
    expect(paused.body.status).toBe("paused");
    const resumed = await request(app).post("/api/adventure/resume");
    expect(resumed.body.status).toBe("active");
    const ended = await request(app).post("/api/adventure/end");
    expect(ended.body.status).toBe("ended");
  });

  it("accepts votes only for an active adventure and known choices", async () => {
    const app = createApp();
    const initial = await request(app).get("/api/adventure");
    const forestChoiceId = initial.body.choices[0].id;
    expect((await request(app).post("/api/adventure/vote").send({ choiceId: forestChoiceId })).status).toBe(409);
    await request(app).post("/api/adventure/start");
    expect((await request(app).post("/api/adventure/vote").send({ choiceId: "missing" })).status).toBe(400);
    const voted = await request(app).post("/api/adventure/vote").send({ choiceId: forestChoiceId });
    expect(voted.status).toBe(200);
    expect(voted.body.choices.find((choice: { id: string }) => choice.id === forestChoiceId).votes).toBe(1);
  });

  it("returns persisted adventure history through the API", async () => {
    const app = createApp();
    const first = await request(app).get("/api/adventure");
    await request(app).post("/api/adventure/start");
    await request(app).post("/api/adventure/end");
    await request(app).post("/api/adventure/create");
    const history = await request(app).get("/api/adventure/history");
    expect(history.status).toBe(200);
    expect(history.body[0].id).toBe(first.body.id);
    expect(history.body[0].status).toBe("ended");
  });

  it("never reports Twitch as connected without OAuth and explains the configuration needed", async () => {
    const app = createApp();
    const status = await request(app).get("/api/twitch/status");
    expect(status.body.connected).toBe(false);
    expect(status.body.message).toContain("TWITCH_CLIENT_ID");
    const connect = await request(app).post("/api/auth/twitch");
    expect(connect.status).toBe(503);
    expect(connect.body.error).toContain("TWITCH_CLIENT_SECRET");
  });

  it("emits readiness after a Socket.IO connection", async () => {
    const httpServer = createServer(createApp());
    const ioServer = new Server(httpServer);
    registerRealtimeHandlers(ioServer);
    httpServer.listen(0, "127.0.0.1");
    await once(httpServer, "listening");

    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP address");
    }

    const client = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"]
    });

    try {
      const status = await new Promise<ServerStatus>((resolve, reject) => {
        client.once("server:ready", resolve);
        client.once("connect_error", reject);
      });
      expect(status).toMatchObject({
        connected: true,
        service: "chatquest-server"
      });
    } finally {
      client.close();
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    }
  });
});
