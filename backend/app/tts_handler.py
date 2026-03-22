"""
TTSHandler
──────────
Streams ElevenLabs TTS audio to the frontend browser client.

Flow:
  1. Pre-send viseme schedule (rule-based, runs in < 1ms) so the
     AnimationController can start queuing lip movements immediately.
  2. Stream MP3 audio chunks as base64-encoded WebSocket messages.
  3. Signal 'audio_end' so the frontend knows playback is finishing.
"""

import base64
import httpx
from .viseme_generator import VisemeGenerator

_visemer = VisemeGenerator()

# ElevenLabs configuration — replace VOICE_ID with your chosen voice
VOICE_ID   = "21m00Tcm4TlvDq8ikWAM"   # Rachel (ElevenLabs default)
MODEL_ID   = "eleven_turbo_v2_5"       # Low-latency model
_STREAM_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream"


class TTSHandler:
    def __init__(self, api_key: str, send_event):
        """
        Args:
            api_key:    ElevenLabs API key.
            send_event: Async callable(event_type: str, payload: dict).
        """
        self.api_key    = api_key
        self.send_event = send_event

    async def stream(self, text: str):
        """
        Stream TTS for the given clean text (no emotion tags).

        Steps:
          1. Generate and send viseme schedule (no network call needed).
          2. Stream MP3 chunks from ElevenLabs.
          3. Send audio_end signal.
        """
        # ① Pre-send viseme schedule before audio arrives
        schedule = _visemer.text_to_visemes(text)
        await self.send_event("visemes", {"schedule": schedule})

        headers = {
            "xi-api-key":   self.api_key,
            "Content-Type": "application/json",
            "Accept":       "audio/mpeg",
        }
        body = {
            "text":    text,
            "model_id": MODEL_ID,
            "voice_settings": {
                "stability":        0.45,
                "similarity_boost": 0.75,
                "style":            0.35,
                "use_speaker_boost": True,
            },
        }

        # ② Stream audio chunks, forwarding each to the frontend as base64
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST", _STREAM_URL,
                headers=headers, json=body
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    await self.send_event("audio_chunk", {
                        "data": base64.b64encode(chunk).decode(),
                        "mime": "audio/mpeg",
                    })

        # ③ Signal end of audio stream
        await self.send_event("audio_end", {})
