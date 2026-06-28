import { useEffect, useRef, useCallback } from "react";
import type { PipelineEvent } from "./usePipeline";

interface UseWebSocketOptions {
  runId: string | null;
  onMessage: (event: PipelineEvent) => void;
  onError?: (error: string) => void;
}

export function useWebSocket({ runId, onMessage, onError }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!runId) return;

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws?runId=${runId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PipelineEvent;
        onMessage(data);
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => {
      onError?.("WebSocket connection error");
    };

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(() => connect(), 3000);
    };
  }, [runId, onMessage, onError]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}

export type { PipelineEvent };
