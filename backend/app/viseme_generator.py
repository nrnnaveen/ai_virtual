"""
VisemeGenerator
───────────────
Converts plain text into a timed schedule of viseme (mouth shape) keyframes.
The schedule is sent to the frontend BEFORE audio starts, so the
AnimationController can begin queuing mouth movements immediately.

Viseme IDs follow the OVR LipSync / Ready Player Me standard:
    sil  PP  FF  TH  DD  kk  CH  SS  nn  RR  aa  E  ih  oh  ou

Pipeline:
    text → tokenise words → grapheme heuristic → viseme lookup → timestamp assignment

No external API calls are needed — this runs locally in < 1ms for typical responses.
Optional: install `g2p-en` for more accurate phoneme-to-viseme conversion.
"""

import re
from dataclasses import dataclass
from typing import List

# ── Grapheme → viseme heuristic rules (digraphs MUST come before monographs) ──
_GRAPHEME_RULES = [
    (re.compile(r"th"),       "TH"),
    (re.compile(r"sh|ch"),    "CH"),
    (re.compile(r"wh|ph"),    "FF"),
    (re.compile(r"ng"),       "nn"),
    (re.compile(r"[pb]"),     "PP"),
    (re.compile(r"m"),        "PP"),
    (re.compile(r"[fv]"),     "FF"),
    (re.compile(r"[dt]"),     "DD"),
    (re.compile(r"[ln]"),     "nn"),
    (re.compile(r"r"),        "RR"),
    (re.compile(r"[sz]"),     "SS"),
    (re.compile(r"[kg]"),     "kk"),
    (re.compile(r"[aeiou]"),  "aa"),   # rough vowel fallback
]

# ── Timing constants ───────────────────────────────────────────────────────────
_MS_PER_PHONEME = 60    # average hold time per phoneme in milliseconds
_WORD_GAP_MS    = 40    # brief silence at word boundaries
_PUNCT_PAUSE_MS = 180   # longer pause for punctuation (. , ! ?)


@dataclass
class VisemeFrame:
    time_ms: float
    viseme:  str
    weight:  float   # 0.0–1.0 blend weight for the morph target


class VisemeGenerator:

    def text_to_visemes(self, text: str) -> List[dict]:
        """
        Convert plain text to a list of timed viseme keyframes.

        Returns JSON-serialisable list:
            [{"time_ms": 0, "viseme": "sil", "weight": 0.0}, ...]
        """
        # Tokenise: extract words and punctuation separately
        tokens = re.findall(r"[a-zA-Z']+|[.,!?;]", text)
        frames: List[VisemeFrame] = []
        cursor = 0.0

        for token in tokens:
            # Punctuation → silence pause
            if re.match(r"[.,!?;]", token):
                frames.append(VisemeFrame(cursor, "sil", 0.0))
                cursor += _PUNCT_PAUSE_MS
                continue

            # Opening silence at word boundary
            frames.append(VisemeFrame(cursor, "sil", 0.0))
            cursor += _WORD_GAP_MS

            visemes = self._word_to_visemes(token.lower())
            n = len(visemes)
            for i, vis in enumerate(visemes):
                # Peaks in the middle of a word, tapers at edges
                weight = 0.9 if 0 < i < n - 1 else 0.7
                frames.append(VisemeFrame(round(cursor), vis, weight))
                cursor += _MS_PER_PHONEME

        # Final silence to close the mouth
        frames.append(VisemeFrame(round(cursor), "sil", 0.0))

        return [
            {"time_ms": f.time_ms, "viseme": f.viseme, "weight": f.weight}
            for f in frames
        ]

    def _word_to_visemes(self, word: str) -> List[str]:
        """
        Convert a single lowercase word to a list of viseme IDs.
        Tries g2p_en first for accuracy; falls back to grapheme heuristic.
        Consecutive duplicate visemes are collapsed to prevent jitter.
        """
        try:
            from g2p_en import G2p  # optional accurate phonemiser
            g2p = G2p()
            phonemes = g2p(word)
            # g2p returns phonemes like 'P', 'AH0', 'T' — map to viseme
            PHONEME_MAP = {
                "p": "PP", "b": "PP", "m": "PP",
                "f": "FF", "v": "FF",
                "th": "TH", "dh": "TH",
                "d": "DD", "t": "DD", "l": "DD",
                "s": "SS", "z": "SS",
                "sh": "CH", "zh": "CH", "ch": "CH", "jh": "CH",
                "k": "kk", "g": "kk",
                "n": "nn", "ng": "nn",
                "r": "RR",
                "w": "ou", "y": "ih",
                "h": "sil",
                "aa": "aa", "ae": "aa", "ah": "aa", "aw": "aa", "ay": "aa",
                "eh": "E",  "er": "E",  "ey": "E",
                "ih": "ih", "iy": "ih",
                "oh": "oh", "ow": "oh", "oy": "oh",
                "uh": "ou", "uw": "ou",
            }
            visemes = [
                PHONEME_MAP.get(ph.lower().rstrip("012"), "sil")
                for ph in phonemes
            ]
        except ImportError:
            visemes = self._grapheme_heuristic(word)

        # Collapse consecutive duplicate visemes
        collapsed = []
        for v in visemes:
            if not collapsed or v != collapsed[-1]:
                collapsed.append(v)

        return collapsed or ["sil"]

    def _grapheme_heuristic(self, word: str) -> List[str]:
        """Rule-based grapheme → viseme mapping. No external deps required."""
        result, remaining = [], word
        while remaining:
            matched = False
            for pattern, vis in _GRAPHEME_RULES:
                m = pattern.match(remaining)
                if m:
                    result.append(vis)
                    remaining = remaining[m.end():]
                    matched = True
                    break
            if not matched:
                remaining = remaining[1:]  # skip unknown character
        return result or ["sil"]
