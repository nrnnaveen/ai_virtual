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

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .pipeline import DigitalHumanPipeline

app = FastAPI(title="Digital Human API", version="1.0.0")

# Allow any localhost origin (any port) so Vite port-drift (5173, 5174…)
# never blocks the WebSocket connection. Replace with your domain in production.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?",
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
