# Digital Human AI Assistant

A production-ready real-time AI avatar with voice interaction, emotional expressions, and lip-sync.

## Stack

| Layer | Technology |
|---|---|
| AI Brain | Claude 3.5 Sonnet (Anthropic) |
| Speech-to-Text | Deepgram Nova-2 (streaming WebSocket) |
| Text-to-Speech | ElevenLabs Turbo v2.5 (streaming MP3) |
| Frontend | React + Vite + React Three Fiber |
| Avatar | Ready Player Me (GLB with OVR visemes) |
| Backend | FastAPI + WebSockets |

---

## Project Structure

```
digital-human/
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI WebSocket endpoint
│   │   ├── pipeline.py          ← Master orchestrator (STT→LLM→TTS)
│   │   ├── llm_handler.py       ← Claude streaming + emotion tag extraction
│   │   ├── tts_handler.py       ← ElevenLabs streaming audio
│   │   ├── emotion_parser.py    ← [EMOTION:X] / [EXPRESSION:X] extractor
│   │   ├── viseme_generator.py  ← Text → timed mouth-shape schedule
│   │   ├── session_store.py     ← Conversation history per session
│   │   └── config.py            ← Pydantic settings / .env loader
│   ├── .env.example
│   └── requirements.txt
│
└── frontend/
    ├── public/
    │   └── avatar.glb           ← ← ← PUT YOUR RPM AVATAR HERE
    ├── src/
    │   ├── components/
    │   │   ├── avatar/
    │   │   │   ├── AvatarScene.jsx       ← R3F Canvas + lighting
    │   │   │   ├── AvatarModel.jsx       ← GLB loader + morph wiring
    │   │   │   └── AnimationController.js ← FSM: emotions + visemes + idle
    │   │   └── ui/
    │   │       ├── MicButton.jsx
    │   │       ├── EmotionHUD.jsx
    │   │       └── SubtitleBar.jsx
    │   ├── hooks/
    │   │   ├── useSocket.js       ← WebSocket connection + event dispatch
    │   │   ├── useMicrophone.js   ← MediaStream → 16kHz PCM chunks
    │   │   └── useAudioQueue.js   ← Gapless MP3 playback via Web Audio
    │   ├── store/
    │   │   └── avatarStore.js     ← Zustand global state
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Quick Start

### 1. Get your avatar

1. Go to [readyplayer.me](https://readyplayer.me)
2. Create an avatar
3. Export as GLB — in export settings enable:
   - ✅ Morph Targets: **ARKit + Oculus Visemes**
   - ✅ Texture Atlas
4. Save as `frontend/public/avatar.glb`

### 2. Configure API keys

```bash
cd backend
cp .env.example .env
# Edit .env and fill in your keys:
# ANTHROPIC_API_KEY=sk-ant-...
# DEEPGRAM_API_KEY=...
# ELEVENLABS_API_KEY=...
```

### 3. Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 5. Use it

1. Open http://localhost:5173
2. Click the microphone button
3. Grant microphone permission
4. Speak — the avatar will respond with voice and animated expressions

---

## How it works

### Data flow

```
Browser mic (PCM 16kHz)
    → WebSocket binary frame
        → Deepgram STT
            → Claude 3.5 Sonnet (streaming tokens with [EMOTION:X] tags)
                → EmotionParser extracts tags → WebSocket "avatar_event"
                → VisemeGenerator pre-computes mouth schedule → WebSocket "visemes"
                → ElevenLabs TTS streams MP3 → WebSocket "audio_chunk" × N
                                                       ↓
                                            Browser Web Audio API (gapless)
                                                       ↓
                                            AnimationController.startAudio()
                                                       ↓
                                            Viseme schedule plays in sync
```

### Emotion system

Claude is instructed via system prompt to embed hidden metadata tags:

```
[EMOTION:HAPPY]      → mouthSmile blend shape (0.8 intensity, 3s duration)
[EMOTION:SAD]        → mouthFrown blend shape
[EMOTION:SURPRISED]  → eyeWide blend shape
[EXPRESSION:THINKING]→ look_up procedural head animation (2s, once)
[EXPRESSION:NODDING] → nod procedural animation (1.2s, once)
```

Tags are stripped before TTS so they are never spoken aloud.

### Lip sync

1. `VisemeGenerator` converts text to a timed schedule of OVR viseme keyframes using grapheme heuristics (or `g2p-en` if installed).
2. The schedule is sent to the browser **before** audio starts.
3. `AnimationController._updateVisemes()` reads `performance.now()` each frame, looks up the current keyframe, and lerps the corresponding morph target weight.

---

## Customisation

### Change the voice
Edit `VOICE_ID` in `backend/app/tts_handler.py`. Find voice IDs at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library).

### Change the avatar
Replace `frontend/public/avatar.glb`. Any RPM avatar works — just ensure OVR visemes are exported.

### Add new emotions
1. Add the tag value to `EMOTION_MAP` in `emotion_parser.py` with a blend-shape config.
2. The frontend picks it up automatically — no frontend changes needed.

### Improve viseme accuracy
```bash
pip install g2p-en
```
`VisemeGenerator` automatically uses it when available for more accurate phoneme mapping.

---

## Advanced improvements

| Feature | Approach |
|---|---|
| Interrupt handling | Detect user speech mid-response → abort TTS stream + cancel Claude generation |
| Better latency | Use ElevenLabs WebSocket streaming endpoint (`/stream-input`) |
| VAD | Replace Deepgram `endpointing` with Silero VAD (WebAssembly) in the browser |
| Multi-language | Pass `language` to Deepgram + ElevenLabs; update Claude system prompt |
| Emotion memory | Track emotion history in `SessionStore`; inject into Claude context |
| Production deploy | Dockerise backend; serve frontend via CDN; use Redis for session store |
