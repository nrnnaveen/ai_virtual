"""
DigitalHumanPipeline
────────────────────
Master orchestrator for a single WebSocket session.

Owns:
  - Deepgram live STT connection
  - LLMHandler (Claude streaming)
  - TTSHandler (ElevenLabs streaming)
  - SessionStore (conversation history)

Data flow:
  Browser mic bytes → Deepgram STT → _on_transcript()
    → LLMHandler.stream_response()     [emits avatar_event, transcript_chunk]
    → TTSHandler.stream()              [emits visemes, audio_chunk, audio_end]

All outbound messages go through send_event() which serialises to JSON
and pushes over the WebSocket.
"""

import json

from deepgram import DeepgramClient, LiveTranscriptionEvents, LiveOptions

from .config        import settings
from .llm_handler   import LLMHandler
from .tts_handler   import TTSHandler
from .session_store import SessionStore


class DigitalHumanPipeline:

    def __init__(self, websocket, session_id: str):
        self.ws         = websocket
        self.session    = SessionStore(session_id)
        self._dg        = None  # Deepgram live connection

        # Sub-handlers share the same send_event callable
        self.llm = LLMHandler(self.session, self.send_event)
        self.tts = TTSHandler(settings.ELEVENLABS_API_KEY, self.send_event)

    # ── WebSocket helper ──────────────────────────────────────────────────────

    async def send_event(self, event_type: str, payload: dict):
        """Serialise and push a typed event to the browser WebSocket client."""
        try:
            await self.ws.send_text(json.dumps({"type": event_type, **payload}))
        except Exception:
            pass  # Client disconnected — swallow silently

    # ── Deepgram lifecycle ────────────────────────────────────────────────────

    async def start_listening(self):
        """Open a Deepgram live transcription session and register callbacks."""
        try:
            opts = LiveOptions(
                model="nova-2",
                language="en-US",
                punctuate=True,
                encoding="linear16",
                channels=1,
                sample_rate=16000,
                endpointing=400,   # ms of silence before emitting a final transcript
            )
            self._dg = DeepgramClient(api_key=settings.DEEPGRAM_API_KEY) \
                           .listen.asynclive.v("1")
            self._dg.on(LiveTranscriptionEvents.Transcript, self._on_transcript)
            await self._dg.start(opts)
            await self.send_event("status", {"state": "listening"})
        except Exception as e:
            # If Deepgram fails (invalid key, network error, etc), send warning but stay connected
            await self.send_event("error", {
                "message": f"Voice input unavailable: {str(e)}. Use text input instead."
            })
            self._dg = None
            await self.send_event("status", {"state": "idle"})

    async def stop_listening(self):
        """Close the Deepgram session."""
        if self._dg:
            await self._dg.finish()
        await self.send_event("status", {"state": "idle"})

    async def feed_audio(self, pcm_bytes: bytes):
        """Forward raw PCM bytes (16kHz, 16-bit, mono) to Deepgram."""
        if self._dg:
            await self._dg.send(pcm_bytes)

    # ── Deepgram transcript callback ──────────────────────────────────────────

    async def _on_transcript(self, _client, result, **_kw):
        """
        Called by Deepgram when a final utterance is ready.
        Kicks off the full LLM → TTS pipeline.
        """
        sentence = result.channel.alternatives[0].transcript.strip()
        if not sentence or not result.is_final:
            return

        # Echo user's words to the subtitle bar
        await self.send_event("transcript", {"role": "user", "text": sentence})
        await self.send_event("status", {"state": "thinking"})

        # LLM: stream Claude response (emits avatar_event + transcript_chunk)
        clean_text = await self.llm.stream_response(sentence)

        # TTS: stream ElevenLabs audio (emits visemes + audio_chunk + audio_end)
        await self.send_event("status", {"state": "speaking"})
        await self.tts.stream(clean_text)

        await self.send_event("status", {"state": "idle"})

    # ── Text input fallback (for typing instead of speaking) ─────────────────

    async def handle_text(self, text: str):
        """Handle a typed text message — bypasses STT."""
        await self.send_event("transcript", {"role": "user", "text": text})
        await self.send_event("status", {"state": "thinking"})
        clean_text = await self.llm.stream_response(text)
        await self.send_event("status", {"state": "speaking"})
        await self.tts.stream(clean_text)
        await self.send_event("status", {"state": "idle"})
