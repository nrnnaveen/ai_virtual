/**
 * SubtitleBar.jsx
 * ───────────────
 * Shows real-time streaming text from Claude as subtitles
 * at the bottom of the avatar canvas.
 * Fades in when text appears, invisible when empty.
 */

import { useAvatarStore } from "../../store/avatarStore";

export default function SubtitleBar() {
  const currentChunk = useAvatarStore((s) => s.currentChunk);

  if (!currentChunk?.trim()) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 110,
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: 620,
        width: "90%",
        background: "rgba(0, 0, 0, 0.58)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderRadius: 14,
        padding: "10px 20px",
        color: "#fff",
        fontSize: 15,
        lineHeight: 1.55,
        textAlign: "center",
        zIndex: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        transition: "opacity 0.2s",
      }}
    >
      {currentChunk}
    </div>
  );
}
