/**
 * useSocket.js
 * ────────────
 * Manages the WebSocket connection to the FastAPI backend.
 *
 * In development:  connects directly to localhost:8000 WebSocket.
 * In production:   reads VITE_WS_URL env var, falls back to window.location origin.
 *
 * Automatically reconnects after disconnection with exponential back-off.
 * Dispatches typed server events to the Zustand store.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAvatarStore } from "../store/avatarStore";

function getWsBase() {
  // Production override via env var
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  // In dev, connect directly to backend to avoid Vite ws proxy edge-cases.
  // This is safe for localhost and avoids conflicts with HMR sockets.
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//127.0.0.1:8000/ws`;
  }

  // Fallback for non-dev builds without VITE_WS_URL.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function getHealthUrl() {
  // Prefer relative health endpoint in dev so Vite proxy handles localhost differences.
  if (import.meta.env.DEV) return "/health";

  // Keep protocol/host aligned with the current page in non-dev builds.
  const protocol = window.location.protocol;
  return `${protocol}//${window.location.host}/health`;
}

export function useSocket(sessionId) {
  const ws          = useRef(null);
  const retryDelay  = useRef(1000);   // starts at 1 s, backs off to 10 s max
  const retryTimer  = useRef(null);
  const failCount   = useRef(0);
  const store       = useAvatarStore.getState();

  // Dispatch server event to store
  const dispatch = useCallback(
    (msg) => {
      const { type, ...payload } = msg;
      switch (type) {
        case "avatar_event":
          if (payload.category === "emotion")
            store.setEmotionEvent(payload);
          else
            store.setExpressionEvent(payload);
          break;
        case "visemes":        store.setVisemeSchedule(payload.schedule); break;
        case "audio_chunk":    store.enqueueChunk(payload); break;
        case "audio_end":      store.signalAudioEnd(); break;
        case "transcript_chunk": store.appendChunk(payload.text); break;
        case "transcript":     store.commitTranscript(); break;
        case "status":         store.setAvatarState(payload.state); break;
        case "error":
          console.error("[Digital Human API Error]", payload.message);
          break;
        default:
          console.warn("[WS] Unknown event type:", type);
      }
    },
    [store]
  );

  useEffect(() => {
    let cancelled = false;

    const isBackendReachable = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(getHealthUrl(), {
          signal: controller.signal,
          cache: "no-store",
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    };

    const connect = () => {
      if (cancelled) return;

      const url  = `${getWsBase()}/${sessionId}`;
      const sock = new WebSocket(url);
      ws.current = sock;

      sock.onopen = () => {
        store.setWsStatus("connected");
        store.setBackendError(null);
        failCount.current = 0;
        retryDelay.current = 1000; // reset back-off on successful connect
      };

      sock.onclose = async () => {
        if (cancelled) return;

        store.setWsStatus("disconnected");

        // Avoid false positives: only show backend-down overlay
        // if /health is unreachable across repeated failures.
        const reachable = await isBackendReachable();
        if (!reachable) {
          failCount.current += 1;
        } else {
          failCount.current = 0;
        }

        if (failCount.current >= 2) {
          store.setBackendError(
            "Cannot reach backend. " +
            "Make sure FastAPI is running:\n\n" +
            "  cd backend && uvicorn app.main:app --reload --port 8000"
          );
        } else if (reachable) {
          store.setBackendError(null);
        }

        // Exponential back-off: 1s → 2s → 4s → … capped at 10s
        const delay = Math.min(retryDelay.current, 10000);
        retryDelay.current = delay * 2;
        retryTimer.current = setTimeout(connect, delay);
      };

      sock.onerror = () => {
        // onclose fires after onerror — error message is set there
      };

      sock.onmessage = ({ data }) => {
        try { dispatch(JSON.parse(data)); } catch (e) {
          console.warn("[WS] Failed to parse message:", e);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      ws.current?.close();
    };
  }, [sessionId, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Send raw PCM audio bytes (ArrayBuffer / TypedArray) to the backend. */
  const sendAudio = useCallback((pcmBuffer) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(pcmBuffer);
  }, []);

  /** Send a JSON control command, e.g. { cmd: "start_listening" }. */
  const sendCmd = useCallback((cmd, extra = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ cmd, ...extra }));
  }, []);

  return { sendAudio, sendCmd };
}
