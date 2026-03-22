/**
 * useAudioQueue.js
 * ────────────────
 * Receives base64-encoded MP3 chunks from the WebSocket store and plays them
 * via the Web Audio API with gapless sequential scheduling.
 *
 * When the first chunk starts playing, it records performance.now() as
 * audioStartTime so the AnimationController can sync viseme timestamps
 * to real wall-clock time.
 */

import { useEffect, useRef } from "react";
import { useAvatarStore }    from "../store/avatarStore";

export function useAudioQueue() {
  const ctxRef    = useRef(null);
  const nextAtRef = useRef(0);      // AudioContext time for next scheduled chunk
  const playingRef = useRef(false); // whether we've started playback this turn

  const {
    audioQueue,
    audioEnded,
    setIsSpeaking,
    setAudioStartTime,
    clearAudio,
  } = useAvatarStore();

  // Lazily create AudioContext (must happen inside user gesture context)
  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  };

  // React to new audio chunks arriving in the store
  useEffect(() => {
    if (!audioQueue.length) return;

    const latest = audioQueue[audioQueue.length - 1];
    scheduleChunk(latest);
  }, [audioQueue]); // eslint-disable-line

  // React to audio stream ending
  useEffect(() => {
    if (!audioEnded) return;

    const ac = ctxRef.current;
    if (!ac) return;

    // Calculate how many ms remain until the last scheduled buffer finishes
    const msRemaining = Math.max(0, (nextAtRef.current - ac.currentTime) * 1000);

    setTimeout(() => {
      setIsSpeaking(false);
      playingRef.current = false;
      nextAtRef.current  = 0;
      clearAudio();
    }, msRemaining + 250); // 250ms grace period
  }, [audioEnded]); // eslint-disable-line

  async function scheduleChunk({ data }) {
    const ac = getCtx();

    // Decode base64 → ArrayBuffer
    const binary = atob(data);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    let decoded;
    try {
      decoded = await ac.decodeAudioData(bytes.buffer.slice(0));
    } catch (e) {
      console.warn("[AudioQueue] Failed to decode chunk:", e);
      return;
    }

    // Schedule gaplessly after previous chunk
    const startAt      = Math.max(ac.currentTime, nextAtRef.current);
    nextAtRef.current  = startAt + decoded.duration;

    const source = ac.createBufferSource();
    source.buffer = decoded;
    source.connect(ac.destination);
    source.start(startAt);

    // Record timing on first chunk for viseme sync
    if (!playingRef.current) {
      playingRef.current = true;
      setIsSpeaking(true);

      // Convert AudioContext time to wall-clock ms
      const msUntilStart = (startAt - ac.currentTime) * 1000;
      setAudioStartTime(performance.now() + msUntilStart);
    }
  }
}
