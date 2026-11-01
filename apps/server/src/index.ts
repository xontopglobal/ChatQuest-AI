import { createServer } from "node:http";
import { Server } from "socket.io";
import { SqliteAdventureStore } from "./adventureStore.js";
import { createApp } from "./app.js";
import { serverConfig } from "./config.js";
import { registerRealtimeHandlers } from "./realtime.js";

const adventureStore = new SqliteAdventureStore(serverConfig.sqlitePath);
const httpServer = createServer(createApp(adventureStore, serverConfig));
const io = new Server(httpServer, {
  cors: { origin: serverConfig.webOrigin }
});

registerRealtimeHandlers(io);

httpServer.listen(serverConfig.port, "0.0.0.0", () => {
  console.log(`ChatQuest API and realtime server listening on :${serverConfig.port}`);
});

function closeServer() {
  io.close(() => {
    httpServer.close(() => {
      adventureStore.close();
      process.exit(0);
    });
  });
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
