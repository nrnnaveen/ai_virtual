/**
 * EmotionHUD.jsx
 * ──────────────
 * Translucent overlay in the top-right corner showing the avatar's
 * current emotional state and connection status.
 * Purely informational — no interaction.
 */

import { useAvatarStore } from "../../store/avatarStore";

const EMOTION_ICONS = {
  HAPPY:      "😊",
  SAD:        "😢",
  ANGRY:      "😠",
  SURPRISED:  "😲",
  EXCITED:    "🤩",
  NEUTRAL:    "😐",
  CONFUSED:   "🤔",
  EMPATHETIC: "🥹",
};

const EXPRESSION_ICONS = {
  THINKING:  "💭",
  NODDING:   "👍",
  BLINKING:  "👁",
  TILTING:   "↗",
  LAUGHING:  "😄",
  LISTENING: "👂",
};

const STATE_COLORS = {
  idle:      "#888",
  listening: "#4caf50",
  thinking:  "#ff9800",
  speaking:  "#2196f3",
};

function Pill({ bg, border, children }) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 20,
        padding: "5px 13px",
        display: "flex",
        alignItems: "center",
        gap: 7,
        color: "#fff",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

export default function EmotionHUD() {
  const emotionEvent    = useAvatarStore((s) => s.emotionEvent);
  const expressionEvent = useAvatarStore((s) => s.expressionEvent);
  const avatarState     = useAvatarStore((s) => s.avatarState);
  const wsStatus        = useAvatarStore((s) => s.wsStatus);

  const emotion    = emotionEvent?.value    ?? "NEUTRAL";
  const expression = expressionEvent?.value ?? null;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      {/* Connection status */}
      <Pill bg="rgba(0,0,0,0.45)" border="rgba(255,255,255,0.12)">
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: wsStatus === "connected" ? "#4caf50" : "#f44336",
            flexShrink: 0,
          }}
        />
        <span style={{ opacity: 0.7 }}>
          {wsStatus === "connected" ? "connected" : "reconnecting…"}
        </span>
      </Pill>

      {/* Avatar FSM state */}
      <Pill bg="rgba(0,0,0,0.45)" border="rgba(255,255,255,0.12)">
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: STATE_COLORS[avatarState] ?? "#888",
            flexShrink: 0,
          }}
        />
        <span style={{ opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {avatarState}
        </span>
      </Pill>

      {/* Current emotion */}
      <Pill bg="rgba(40,20,80,0.55)" border="rgba(150,100,255,0.3)">
        <span style={{ fontSize: 16 }}>{EMOTION_ICONS[emotion] ?? "😐"}</span>
        <span style={{ opacity: 0.8 }}>{emotion}</span>
      </Pill>

      {/* Active expression (only when non-null) */}
      {expression && (
        <Pill bg="rgba(20,50,30,0.55)" border="rgba(80,200,120,0.3)">
          <span style={{ fontSize: 16 }}>{EXPRESSION_ICONS[expression] ?? "💬"}</span>
          <span style={{ opacity: 0.8 }}>{expression}</span>
        </Pill>
      )}
    </div>
  );
}
