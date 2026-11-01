import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectDirectory = resolve(serverDirectory, "..", "..");

// Load the project-root .env only from server code. Vite never receives secret values.
loadDotenv({ path: resolve(projectDirectory, ".env") });

export interface ServerConfig {
  port: number;
  webOrigin: string;
  sqlitePath: string;
  twitch: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  };
  openaiApiKey?: string;
}

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const portValue = optionalValue(env.PORT) ?? "3001";
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const clientId = optionalValue(env.TWITCH_CLIENT_ID);
  const clientSecret = optionalValue(env.TWITCH_CLIENT_SECRET);
  const redirectUri = optionalValue(env.TWITCH_REDIRECT_URI);
  const twitchFields = [clientId, clientSecret, redirectUri];
  if (twitchFields.some(Boolean) && !twitchFields.every(Boolean)) {
    throw new Error("Configure all of TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and TWITCH_REDIRECT_URI, or leave all three empty.");
  }
  if (redirectUri) {
    let uri: URL;
    try {
      uri = new URL(redirectUri);
    } catch {
      throw new Error("TWITCH_REDIRECT_URI must be a valid absolute URL.");
    }
    if (uri.protocol !== "http:" && uri.protocol !== "https:") {
      throw new Error("TWITCH_REDIRECT_URI must use HTTP or HTTPS.");
    }
  }

  const webOrigin = optionalValue(env.WEB_ORIGIN) ?? "http://localhost:5173";
  try {
    new URL(webOrigin);
  } catch {
    throw new Error("WEB_ORIGIN must be a valid absolute URL.");
  }

  const configuredSqlitePath = optionalValue(env.SQLITE_PATH) ?? "data/chatquest.sqlite";
  const sqlitePath = configuredSqlitePath === ":memory:"
    ? configuredSqlitePath
    : resolve(projectDirectory, configuredSqlitePath);

  return {
    port,
    webOrigin,
    sqlitePath,
    twitch: { clientId, clientSecret, redirectUri },
    openaiApiKey: optionalValue(env.OPENAI_API_KEY)
  };
}

export const serverConfig = parseServerConfig();

export function getProjectDirectory(): string {
  return projectDirectory;
}
