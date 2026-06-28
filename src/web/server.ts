/**
 * Web 操作台服务器入口。
 * Express + WebSocket，仅监听 127.0.0.1:3617。
 */
import express from "express";
import cors from "cors";
import http from "node:http";
import { WebSocketServer } from "ws";
import { router } from "./routes.js";
import { addClient, closeAll } from "./ws.js";
import { loadEnv } from "../utils/env.js";

const DEFAULT_PORT = 3617;
const DEFAULT_HOST = "127.0.0.1";

export async function startWebServer(port = DEFAULT_PORT, host = DEFAULT_HOST): Promise<void> {
  loadEnv();

  const app = express();

  // CORS: 仅允许 localhost
  app.use(cors({ origin: /^https?:\/\/localhost(:\d+)?$/ }));

  // JSON body 解析
  app.use(express.json({ limit: "1mb" }));

  // 静态文件服务（前端构建产物）
  app.use(express.static("client/dist"));

  // API 路由
  app.use(router);

  // SPA fallback: 非 /api 请求回退到 index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile("index.html", { root: "client/dist" }, (err) => {
      if (err) {
        res.status(200).send("RepoPassport Web Panel — please build the frontend first (npm run build:client)");
      }
    });
  });

  const server = http.createServer(app);

  // WebSocket
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const runId = url.searchParams.get("runId") || "unknown";

    addClient(ws, runId);
  });

  return new Promise((resolve, reject) => {
    server.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use. Is RepoPassport web already running?`));
      } else {
        reject(err);
      }
    });

    server.listen(port, host, () => {
      console.log(`\n  RepoPassport Web Panel running at http://${host}:${port}\n`);
      resolve();
    });
  });
}

export function getWebServerPort(): number {
  const envPort = process.env["REPOPASSPORT_PORT"];
  return envPort ? parseInt(envPort, 10) || DEFAULT_PORT : DEFAULT_PORT;
}
