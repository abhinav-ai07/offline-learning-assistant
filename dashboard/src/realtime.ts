import { useEffect } from "react";
import { getStoredToken } from "./api";

export interface RealtimeEvent {
  type: string;
  class_level?: number | null;
  lesson_id?: string;
  subject?: string;
  chapter_number?: number;
  event_type?: string;
  completed?: boolean;
}

const REALTIME_EVENT_NAME = "ila:realtime";

export function useRealtimeConnection(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let closedByCleanup = false;
    let backoffMs = 1500;

    const connect = () => {
      if (closedByCleanup) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const token = getStoredToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      const url = `${protocol}//${window.location.host}/ws/events${query}`;

      socket = new WebSocket(url);
      socket.onopen = () => {
        backoffMs = 1500;
        if (pingTimer !== null) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as RealtimeEvent;
          window.dispatchEvent(new CustomEvent<RealtimeEvent>(REALTIME_EVENT_NAME, { detail: payload }));
        } catch {
          // Ignore malformed messages
        }
      };
      socket.onclose = () => {
        if (pingTimer !== null) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, backoffMs);
          backoffMs = Math.min(5000, backoffMs + 1000);
        }
      };
      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (pingTimer !== null) window.clearInterval(pingTimer);
      socket?.close();
    };
  }, [enabled]);
}

export function subscribeRealtime(
  types: readonly string[],
  handler: (event: RealtimeEvent) => void,
): () => void {
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<RealtimeEvent>).detail;
    if (detail && types.includes(detail.type)) {
      handler(detail);
    }
  };
  window.addEventListener(REALTIME_EVENT_NAME, listener);
  return () => window.removeEventListener(REALTIME_EVENT_NAME, listener);
}
