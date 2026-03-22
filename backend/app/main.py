"""
FastAPI entry point
───────────────────
Exposes a single WebSocket endpoint: /ws/{session_id}

Message protocol (browser → server):
  Binary frames   → raw PCM audio bytes (16kHz, 16-bit, mono)
  Text frames     → JSON command objects:
      {"cmd": "start_listening"}
      {"cmd": "stop_listening"}
      {"cmd": "text_input", "text": "Hello!"}

Message protocol (server → browser):
  All messages are JSON text frames with a "type" field:
      {"type": "status",           "state": "listening|thinking|speaking|idle"}
      {"type": "transcript",       "role": "user|assistant", "text": "..."}
      {"type": "transcript_chunk", "text": "..."}          ← streaming subtitle
      {"type": "avatar_event",     "category": "emotion|expression",
                                   "value": "HAPPY", "config": {...}}
      {"type": "visemes",          "schedule": [{time_ms, viseme, weight}, ...]}
      {"type": "audio_chunk",      "data": "<base64 MP3>", "mime": "audio/mpeg"}
      {"type": "audio_end"}
      {"type": "error",            "message": "..."}
"""

import json
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .pipeline import DigitalHumanPipeline

app = FastAPI(title="Digital Human API", version="1.0.0")

# CORS origins are configurable via the ALLOWED_ORIGINS environment variable
# so that production deployments can restrict access to their own domains.
#
# Local development default: allow all localhost origins (any port) so Vite
# port-drift (5173, 5174…) never blocks the WebSocket connection.
#
# Production example (set in Render / Docker env):
#   ALLOWED_ORIGINS=https://ai-virtual-frontend.onrender.com
_env_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
)
ALLOWED_ORIGINS = [o.strip() for o in _env_origins.split(",") if o.strip()]

# Always permit plain localhost patterns for local development convenience
# even when ALLOWED_ORIGINS is overridden with a production value.
_LOCALHOST_REGEX = r"http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=_LOCALHOST_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.websocket("/ws/{session_id}")
async def ws_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    pipeline = DigitalHumanPipeline(websocket, session_id)

    try:
        await pipeline.start_listening()

        while True:
            message = await websocket.receive()

            if "bytes" in message:
                # Raw 16kHz PCM audio from the browser microphone
                await pipeline.feed_audio(message["bytes"])

            elif "text" in message:
                data = json.loads(message["text"])
                cmd  = data.get("cmd")

                if cmd == "stop_listening":
                    await pipeline.stop_listening()

                elif cmd == "start_listening":
                    await pipeline.start_listening()

                elif cmd == "text_input":
                    text = data.get("text", "").strip()
                    if text:
                        await pipeline.handle_text(text)

    except WebSocketDisconnect:
        await pipeline.stop_listening()

    except Exception as exc:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": str(exc)})
            )
        except Exception:
            pass


@app.get("/health")
async def health():
    return {"status": "ok", "service": "digital-human-api"}
