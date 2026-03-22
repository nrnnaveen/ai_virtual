/**
 * avatarStore.js
 * ──────────────
 * Zustand global state — single source of truth for all real-time avatar data.
 * All WebSocket events are dispatched here; React components and hooks
 * subscribe to only the slices they need.
 */

import { create } from "zustand";

export const useAvatarStore = create((set) => ({
  // ── Connection ──────────────────────────────────────────────────────────────
  wsStatus: "disconnected",
  setWsStatus: (wsStatus) => set({ wsStatus }),

  // Human-readable error shown when backend is unreachable
  backendError: null,
  setBackendError: (backendError) => set({ backendError }),

  // ── Avatar FSM state ────────────────────────────────────────────────────────
  // Values: "idle" | "listening" | "thinking" | "speaking"
  avatarState: "idle",
  setAvatarState: (avatarState) => set({ avatarState }),

  // ── Emotion & expression events (forwarded to AnimationController) ──────────
  emotionEvent: null,
  expressionEvent: null,
  setEmotionEvent: (emotionEvent) => set({ emotionEvent }),
  setExpressionEvent: (expressionEvent) => set({ expressionEvent }),

  // ── Viseme schedule ─────────────────────────────────────────────────────────
  // Array of { time_ms, viseme, weight } keyframes
  visemeSchedule: [],
  setVisemeSchedule: (visemeSchedule) => set({ visemeSchedule }),

  // ── Audio playback ──────────────────────────────────────────────────────────
  audioQueue: [],     // queue of { data: base64, mime: string } chunks
  audioEnded: false,  // true when backend signals stream is complete
  isSpeaking: false,  // true while audio is actively playing
  audioStartTime: null, // performance.now() when first chunk starts playing

  enqueueChunk: (chunk) =>
    set((state) => ({ audioQueue: [...state.audioQueue, chunk], audioEnded: false })),
  signalAudioEnd: () => set({ audioEnded: true }),
  clearAudio: () => set({ audioQueue: [], audioEnded: false }),
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  setAudioStartTime: (audioStartTime) => set({ audioStartTime }),

  // ── Transcript (for subtitle bar) ──────────────────────────────────────────
  currentChunk: "",   // streaming assistant text (cleared on commit)
  appendChunk: (text) =>
    set((state) => ({ currentChunk: state.currentChunk + text })),
  commitTranscript: () => set({ currentChunk: "" }),
}));
