export interface ServerStatus {
  connected: true;
  service: "chatquest-server";
  timestamp: string;
}

export interface HealthResponse {
  status: "ok";
  service: "chatquest-server";
  timestamp: string;
}