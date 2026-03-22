/**
 * MicButton.jsx
 * ─────────────
 * Push-to-talk / toggle microphone button.
 * Pulses with a ring animation while listening.
 */

import { useEffect, useRef } from "react";

export default function MicButton({ active, onClick, avatarState }) {
  const ringRef = useRef(null);

  // CSS keyframe pulse injected once
  useEffect(() => {
    if (document.getElementById("mic-btn-styles")) return;
    const style = document.createElement("style");
    style.id = "mic-btn-styles";
    style.textContent = `
      @keyframes micPulse {
        0%   { transform: scale(1);   opacity: 0.7; }
        50%  { transform: scale(1.55); opacity: 0.2; }
        100% { transform: scale(1);   opacity: 0.7; }
      }
      .mic-pulse { animation: micPulse 1.4s ease-in-out infinite; }
    `;
    document.head.appendChild(style);
  }, []);

  const stateLabel = {
    idle:      active ? "Tap to stop" : "Tap to speak",
    listening: "Listening…",
    thinking:  "Thinking…",
    speaking:  "Speaking…",
  }[avatarState] ?? "Tap to speak";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {/* Pulse ring (only while listening) */}
      <div style={{ position: "relative", width: 72, height: 72 }}>
        {active && (
          <div
            ref={ringRef}
            className="mic-pulse"
            style={{
              position: "absolute",
              inset: -10,
              borderRadius: "50%",
              border: "2px solid rgba(220, 80, 80, 0.6)",
              pointerEvents: "none",
            }}
          />
        )}

        <button
          onClick={onClick}
          aria-label={active ? "Stop microphone" : "Start microphone"}
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.18)",
            background: active
              ? "rgba(210, 50, 50, 0.88)"
              : "rgba(80, 50, 180, 0.82)",
            color: "#fff",
            fontSize: 26,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s, box-shadow 0.2s",
            boxShadow: active
              ? "0 0 28px rgba(210,50,50,0.65)"
              : "0 0 18px rgba(80,50,180,0.45)",
            outline: "none",
          }}
        >
          {active ? "■" : "🎤"}
        </button>
      </div>

      <span
        style={{
          color: "rgba(255,255,255,0.45)",
          fontSize: 12,
          letterSpacing: "0.04em",
          userSelect: "none",
        }}
      >
        {stateLabel}
      </span>
    </div>
  );
}
