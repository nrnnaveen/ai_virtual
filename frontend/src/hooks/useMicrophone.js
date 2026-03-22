/**
 * useMicrophone.js
 * ────────────────
 * Captures browser microphone audio, resamples it to 16kHz mono PCM,
 * and streams 100ms chunks via sendAudio() to the WebSocket backend.
 *
 * Browser mic is typically 48kHz; Deepgram STT requires 16kHz.
 * We downsample by a factor of 3 using a simple sample-drop approach
 * (acceptable quality for speech; use a proper FIR filter for music).
 *
 * Uses ScriptProcessorNode (deprecated but universally supported).
 * For production consider migrating to AudioWorkletNode.
 */

import { useState, useRef } from "react";

const TARGET_SAMPLE_RATE = 16000;   // Deepgram expects 16kHz
const SOURCE_SAMPLE_RATE = 48000;   // Typical browser default
const DOWNSAMPLE_RATIO   = SOURCE_SAMPLE_RATE / TARGET_SAMPLE_RATE; // 3
const CHUNK_DURATION_MS  = 100;     // Send a chunk every 100ms

export function useMicrophone(sendAudio) {
  const [active, setActive] = useState(false);
  const refs = useRef({});

  const start = async () => {
    if (active) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount:    1,
        sampleRate:      SOURCE_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
      },
    });

    const ctx       = new AudioContext({ sampleRate: SOURCE_SAMPLE_RATE });
    const src       = ctx.createMediaStreamSource(stream);
    const chunkSize = Math.floor(ctx.sampleRate * (CHUNK_DURATION_MS / 1000));

    // ScriptProcessorNode gives us raw float32 PCM per chunk
    const proc = ctx.createScriptProcessor(chunkSize, 1, 1);

    proc.onaudioprocess = ({ inputBuffer }) => {
      const float32 = inputBuffer.getChannelData(0);
      const outLen  = Math.floor(float32.length / DOWNSAMPLE_RATIO);
      const int16   = new Int16Array(outLen);

      for (let i = 0; i < outLen; i++) {
        // Simple sample-drop downsampling
        const sample = Math.max(-1, Math.min(1, float32[i * DOWNSAMPLE_RATIO]));
        // Convert float [-1, 1] → int16 [-32768, 32767]
        int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      sendAudio(int16.buffer);
    };

    // Must connect to destination for onaudioprocess to fire (browser quirk)
    src.connect(proc);
    proc.connect(ctx.destination);

    refs.current = { stream, ctx, proc };
    setActive(true);
  };

  const stop = () => {
    if (!active) return;
    refs.current.proc?.disconnect();
    refs.current.ctx?.close();
    refs.current.stream?.getTracks().forEach((t) => t.stop());
    refs.current = {};
    setActive(false);
  };

  return { start, stop, active };
}
