import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { parseServerConfig } from "./config.js";

describe("server-side configuration", () => {
  it("provides safe local defaults and keeps integration credentials optional", () => {
    const config = parseServerConfig({});
    expect(config.port).toBe(3001);
    expect(config.webOrigin).toBe("http://localhost:5173");
    expect(config.sqlitePath).toContain("chatquest.sqlite");
    expect(isAbsolute(config.sqlitePath)).toBe(true);
    expect(config.twitch.clientSecret).toBeUndefined();
    expect(config.openaiApiKey).toBeUndefined();
  });

  it("rejects incomplete Twitch configuration", () => {
    expect(() => parseServerConfig({ TWITCH_CLIENT_ID: "example-client-id" })).toThrow("Configure all of TWITCH_CLIENT_ID");
  });

  it("parses a complete server-only Twitch configuration without requiring OAuth", () => {
    const config = parseServerConfig({
      TWITCH_CLIENT_ID: "example-client-id",
      TWITCH_CLIENT_SECRET: "example-client-secret",
      TWITCH_REDIRECT_URI: "http://localhost:3001/auth/twitch/callback",
      OPENAI_API_KEY: "example-openai-key"
    });
    expect(config.twitch.clientId).toBe("example-client-id");
    expect(config.twitch.redirectUri).toBe("http://localhost:3001/auth/twitch/callback");
    expect(config.openaiApiKey).toBe("example-openai-key");
  });
});
