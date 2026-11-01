import type { Server } from "socket.io";
import type { ServerStatus } from "@chatquest/shared";

export function registerRealtimeHandlers(io: Server) {
  io.on("connection", (socket) => {
    const status: ServerStatus = {
      connected: true,
      service: "chatquest-server",
      timestamp: new Date().toISOString()
    };

    socket.emit("server:ready", status);
  });
}