"""
LLMHandler
──────────
Streams Claude 3.5 Sonnet responses via the Anthropic SDK.

On every token chunk it:
  1. Extracts emotion/expression events and forwards them immediately over WS
  2. Strips tags from the text chunk
  3. Accumulates clean text for TTS
  4. Sends partial transcript text to the subtitle bar in real-time
"""

import anthropic
from .emotion_parser import EmotionParser
from .session_store  import SessionStore

# Module-level client and parser singletons
_client = anthropic.AsyncAnthropic()
_parser = EmotionParser()

SYSTEM_PROMPT = """
You are a warm, expressive AI assistant rendered as a photorealistic 3D avatar.
You are helpful, curious, and emotionally intelligent.

CRITICAL INSTRUCTION — EMOTION TAGS:
You MUST embed hidden metadata tags throughout your responses using EXACTLY this format:

  [EMOTION:HAPPY]      [EMOTION:SAD]        [EMOTION:SURPRISED]
  [EMOTION:ANGRY]      [EMOTION:NEUTRAL]    [EMOTION:EXCITED]
  [EMOTION:CONFUSED]   [EMOTION:EMPATHETIC]
  [EXPRESSION:THINKING] [EXPRESSION:NODDING] [EXPRESSION:LAUGHING]
  [EXPRESSION:BLINKING] [EXPRESSION:LISTENING]

Rules:
- Place ONE [EMOTION:X] tag at the very START of every reply.
- Insert [EXPRESSION:X] tags mid-sentence to trigger transient animations.
  Example: "Let me think about that [EXPRESSION:THINKING] — I'd say the answer is..."
- NEVER say the tags aloud — they are silently stripped before text-to-speech.
- Match your tone, word choice, and energy level to the emotion tag you emit.
- Be conversational, warm, and concise (2–4 sentences typical).
""".strip()


class LLMHandler:
    def __init__(self, session: SessionStore, send_event):
        """
        Args:
            session:    SessionStore instance for this WebSocket session.
            send_event: Async callable(event_type: str, payload: dict) that
                        writes a JSON message over the WebSocket.
        """
        self.session    = session
        self.send_event = send_event

    async def stream_response(self, user_text: str) -> str:
        """
        Stream a Claude response for user_text.

        - Emits 'avatar_event' WebSocket messages for each emotion/expression tag.
        - Emits 'transcript_chunk' messages for the real-time subtitle bar.
        - Returns the full clean text (tags stripped) for downstream TTS.
        """
        self.session.add_message("user", user_text)

        full_raw   = ""
        clean_text = ""

        async with _client.messages.stream(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=self.session.get_history(),
        ) as stream:

            async for chunk in stream.text_stream:
                full_raw += chunk

                # ① Extract emotion/expression events and forward immediately
                for event in _parser.extract_events(chunk):
                    await self.send_event("avatar_event", event)

                # ② Strip tags from this chunk
                clean_chunk = _parser.strip_tags(chunk)
                clean_text += clean_chunk

                # ③ Send clean text to the frontend subtitle bar
                if clean_chunk.strip():
                    await self.send_event("transcript_chunk", {"text": clean_chunk})

        # Store the full (tagged) response for conversation continuity
        self.session.add_message("assistant", full_raw)

        return clean_text
