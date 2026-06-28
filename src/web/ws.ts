/**
 * WebSocket 进度推送管理器。
 * 管理连接池，将 PipelineEvent 转发到匹配 runId 的客户端。
 */
import type { WebSocket } from "ws";

interface Client {
  ws: WebSocket;
  runId: string;
}

const clients: Client[] = [];

export function addClient(ws: WebSocket, runId: string): void {
  clients.push({ ws, runId });

  ws.on("close", () => {
    const idx = clients.findIndex((c) => c.ws === ws);
    if (idx >= 0) clients.splice(idx, 1);
  });

  ws.on("error", () => {
    const idx = clients.findIndex((c) => c.ws === ws);
    if (idx >= 0) clients.splice(idx, 1);
  });
}

export interface WsMessage {
  type: "step:start" | "step:complete" | "progress" | "error" | "log" | "result";
  step?: string;
  message?: string;
  data?: unknown;
}

export function broadcast(runId: string, msg: WsMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (client.runId === runId && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function sendLog(runId: string, level: "info" | "warn" | "error" | "verbose", msg: string): void {
  broadcast(runId, { type: "log", message: `${level}: ${msg}` });
}

export function closeAll(): void {
  for (const client of clients) {
    try { client.ws.close(); } catch { /* ignore */ }
  }
  clients.length = 0;
}
