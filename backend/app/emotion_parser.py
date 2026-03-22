"""
EmotionParser
─────────────
Extracts [EMOTION:X] and [EXPRESSION:X] tags from Claude's streaming token output.

Tag formats (case-insensitive):
    [EMOTION:HAPPY]        [EMOTION:SAD]         [EMOTION:SURPRISED]
    [EMOTION:EXCITED]      [EMOTION:NEUTRAL]     [EMOTION:CONFUSED]
    [EXPRESSION:THINKING]  [EXPRESSION:NODDING]  [EXPRESSION:LAUGHING]
    [EXPRESSION:LISTENING] [EXPRESSION:BLINKING]

Each tag maps to a config dict that the frontend AnimationController interprets:
  - emotion  → blendshape name + intensity + duration
  - expression → procedural animation name + duration + loop flag
"""

import re
from typing import List

# Single regex handles both tag categories
_TAG_RE = re.compile(r"\[(EMOTION|EXPRESSION):([A-Z_]+)\]", re.IGNORECASE)

# ── Emotion → blend-shape animation config ────────────────────────────────────
# blendshape names match Ready Player Me / ARKit morph target naming
EMOTION_MAP: dict[str, dict] = {
    "HAPPY":      {"blendshape": "mouthSmileLeft",  "intensity": 0.8, "duration": 3.0},
    "SAD":        {"blendshape": "mouthFrownLeft",  "intensity": 0.7, "duration": 4.0},
    "ANGRY":      {"blendshape": "browDownLeft",    "intensity": 0.9, "duration": 2.5},
    "SURPRISED":  {"blendshape": "eyeWideLeft",     "intensity": 1.0, "duration": 1.5},
    "EXCITED":    {"blendshape": "mouthSmileLeft",  "intensity": 1.0, "duration": 2.0},
    "NEUTRAL":    {"blendshape": "reset",           "intensity": 0.0, "duration": 0.8},
    "CONFUSED":   {"blendshape": "browInnerUp",     "intensity": 0.7, "duration": 2.0},
    "EMPATHETIC": {"blendshape": "mouthSmileLeft",  "intensity": 0.4, "duration": 3.5},
}

# ── Expression → procedural animation config ──────────────────────────────────
EXPRESSION_MAP: dict[str, dict] = {
    "THINKING":   {"animation": "look_up",       "duration": 2.0, "loop": False},
    "NODDING":    {"animation": "nod",            "duration": 1.2, "loop": False},
    "BLINKING":   {"animation": "blink_fast",     "duration": 0.4, "loop": False},
    "TILTING":    {"animation": "head_tilt",      "duration": 1.5, "loop": False},
    "LAUGHING":   {"animation": "laugh_micro",    "duration": 1.0, "loop": False},
    "LISTENING":  {"animation": "subtle_nod",     "duration": 4.0, "loop": True},
}


class EmotionParser:
    """Stateless — safe as a module-level singleton."""

    def extract_events(self, chunk: str) -> List[dict]:
        """
        Parse a streaming token chunk and return a list of WebSocket-ready
        event dicts. Called on each Claude delta as it streams in.

        Returns list of dicts like:
          {"category": "emotion",    "value": "HAPPY",    "config": {...}}
          {"category": "expression", "value": "THINKING", "config": {...}}
        """
        events = []
        for match in _TAG_RE.finditer(chunk):
            category = match.group(1).upper()   # EMOTION | EXPRESSION
            value    = match.group(2).upper()   # HAPPY, THINKING, etc.

            if category == "EMOTION":
                config = EMOTION_MAP.get(value, EMOTION_MAP["NEUTRAL"])
                events.append({"category": "emotion", "value": value, "config": config})

            elif category == "EXPRESSION":
                config = EXPRESSION_MAP.get(
                    value, {"animation": "nod", "duration": 1.2, "loop": False}
                )
                events.append({"category": "expression", "value": value, "config": config})

        return events

    def strip_tags(self, text: str) -> str:
        """
        Remove all [EMOTION:X] and [EXPRESSION:X] tags from text.
        Also collapses double spaces left behind after removal.
        """
        cleaned = _TAG_RE.sub("", text)
        return re.sub(r" {2,}", " ", cleaned).strip()

    def strip_tags_full(self, full_text: str) -> str:
        """
        Strip tags from a complete response string.
        Collapses extra blank lines too.
        """
        cleaned = _TAG_RE.sub("", full_text)
        cleaned = re.sub(r" {2,}", " ", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()
