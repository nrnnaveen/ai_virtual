/**
 * App.jsx
 * ───────
 * Root component — wires together:
 *   - WebSocket connection (useSocket)
 *   - Audio playback pipeline (useAudioQueue)
 *   - Microphone capture (useMicrophone)
 *   - 3D avatar canvas (AvatarScene)
 *   - UI overlays (EmotionHUD, SubtitleBar, MicButton)
 *   - Backend error overlay (shown when FastAPI is not running)
 */

import { useId, useState } from "react";
import AvatarScene   from "./components/avatar/AvatarScene";
import EmotionHUD    from "./components/ui/EmotionHUD";
import SubtitleBar   from "./components/ui/SubtitleBar";
import MicButton     from "./components/ui/MicButton";
import { useSocket }     from "./hooks/useSocket";
import { useAudioQueue } from "./hooks/useAudioQueue";
import { useMicrophone } from "./hooks/useMicrophone";
import { useAvatarStore }from "./store/avatarStore";

export default function App() {
  const sessionId = useId().replace(/:/g, "");

  const { sendAudio, sendCmd } = useSocket(sessionId);
  useAudioQueue();

  const { start, stop, active } = useMicrophone(sendAudio);
  const avatarState  = useAvatarStore((s) => s.avatarState);
  const backendError = useAvatarStore((s) => s.backendError);

  // Text input fallback state
  const [textInput, setTextInput] = useState("");

  const handleMicToggle = () => {
    if (active) { stop();  sendCmd("stop_listening"); }
    else        { start(); sendCmd("start_listening"); }
  };

  const handleTextSend = () => {
    const t = textInput.trim();
    if (!t) return;
    sendCmd("text_input", { text: t });
    setTextInput("");
  };

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: "radial-gradient(ellipse at 50% 110%, #1a1030 0%, #08060f 65%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      position: "relative", overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ── Backend unreachable error overlay ── */}
      {backendError && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 32, textAlign: "center",
        }}>
          <div style={{
            background: "rgba(200,40,40,0.15)",
            border: "1px solid rgba(255,80,80,0.35)",
            borderRadius: 16, padding: "28px 36px", maxWidth: 520,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ color: "#ff8080", margin: "0 0 12px", fontSize: 18, fontWeight: 500 }}>
              Backend not running
            </h2>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.7, margin: "0 0 20px" }}>
              The FastAPI server isn't reachable. Start it with:
            </p>
            <pre style={{
              background: "rgba(0,0,0,0.5)", borderRadius: 8,
              padding: "12px 16px", fontSize: 12, color: "#7fffb2",
              textAlign: "left", whiteSpace: "pre-wrap", margin: "0 0 20px",
            }}>
{"cd backend\nsource .venv/bin/activate\nuvicorn app.main:app --reload --port 8000"}
            </pre>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
              Then refresh this page. Retrying automatically…
            </p>
          </div>
        </div>
      )}

      {/* ── 3D Avatar Canvas ── */}
      <div style={{ flex: 1, width: "100%", position: "relative" }}>
        <AvatarScene />
        <EmotionHUD />
        <SubtitleBar />
      </div>

      {/* ── Bottom control bar ── */}
      <div style={{
        width: "100%", padding: "14px 24px 20px",
        display: "flex", justifyContent: "center", alignItems: "center",
        gap: 16, background: "rgba(255,255,255,0.025)",
        borderTop: "1px solid rgba(255,255,255,0.06)", zIndex: 20,
      }}>
        {/* Text input fallback */}
        <div style={{ display: "flex", gap: 8, flex: 1, maxWidth: 420 }}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
            placeholder="Or type a message…"
            style={{
              flex: 1, background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10, padding: "9px 14px",
              color: "#fff", fontSize: 13, outline: "none",
            }}
          />
          <button
            onClick={handleTextSend}
            disabled={!textInput.trim()}
            style={{
              background: "rgba(80,50,180,0.7)", border: "none",
              borderRadius: 10, padding: "9px 16px",
              color: "#fff", fontSize: 13, cursor: "pointer",
              opacity: textInput.trim() ? 1 : 0.4,
            }}
          >
            Send
          </button>
        </div>

        <MicButton active={active} onClick={handleMicToggle} avatarState={avatarState} />
      </div>
    </div>
  );
}
