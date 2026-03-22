"""
SessionStore
────────────
Maintains per-session conversation history for Claude.
Uses a bounded deque so memory stays fixed regardless of conversation length.
"""

from collections import deque
from typing import List


class SessionStore:
    def __init__(self, session_id: str, max_turns: int = 20):
        self.session_id = session_id
        # max_turns * 2 because each turn has a user + assistant message
        self._history: deque = deque(maxlen=max_turns * 2)

    def add_message(self, role: str, content: str):
        """Append a user or assistant message to the history."""
        self._history.append({"role": role, "content": content})

    def get_history(self) -> List[dict]:
        """Return the current conversation history as a list."""
        return list(self._history)

    def clear(self):
        """Reset conversation history (e.g., on session restart)."""
        self._history.clear()
