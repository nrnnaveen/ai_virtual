# Deployment Guide – Render.com

This guide walks you through deploying the **Digital Human AI Assistant** on
[Render.com](https://render.com) using the included `render.yaml` blueprint.
Both the FastAPI backend and the React/Vite frontend are deployed as separate
web services so they can scale independently.

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| **Anthropic API key** (Claude LLM) | <https://console.anthropic.com/> |
| **Deepgram API key** (Speech-to-Text) | <https://console.deepgram.com/> |
| **ElevenLabs API key** (Text-to-Speech) | <https://elevenlabs.io/app/settings/api-keys> |
| **Avatar GLB file** | Export from <https://readyplayer.me> and place at `frontend/public/avatar.glb` |
| A **Render account** (free) | <https://render.com> |
| Your repo pushed to **GitHub** | <https://github.com> |

> **Free tier note:** Render's free tier spins down web services after 15 minutes
> of inactivity.  The first request after a spin-down takes ~30 s.  Upgrade to
> the Starter plan ($7/month) for always-on services.

---

## Step 1 – Prepare the repository

1. Make sure `frontend/public/avatar.glb` exists (the app won't render without it).
2. Do **not** commit real API keys.  Use `.env.example` as reference only.
3. Push all changes to your GitHub `main` branch.

---

## Step 2 – Deploy with the Blueprint (recommended)

The `render.yaml` at the repository root is a **Render Blueprint** that
automatically creates both services in one click.

1. Log in to [render.com](https://render.com).
2. Click **"New +"** → **"Blueprint"**.
3. Connect your GitHub account and select the `ai_virtual` repository.
4. Render detects `render.yaml` and shows a preview of the two services.
5. Click **"Apply"**.

Render will now build and deploy both services simultaneously.

---

## Step 3 – Set secret environment variables

After the blueprint is applied, you must add the secret API keys that are
marked `sync: false` in `render.yaml` (Render never auto-fills these for
security reasons).

### Backend service (`ai-virtual-backend`)

1. Open the service in the Render dashboard.
2. Go to **Environment** → **Environment Variables**.
3. Add the following keys:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `DEEPGRAM_API_KEY` | Your Deepgram key |
| `ELEVENLABS_API_KEY` | Your ElevenLabs key |
| `ALLOWED_ORIGINS` | `https://ai-virtual-frontend.onrender.com` (your frontend URL) |
| `BACKEND_URL` | `https://ai-virtual-backend.onrender.com` (this service's URL) |

4. Click **"Save Changes"** – Render redeploys automatically.

### Frontend service (`ai-virtual-frontend`)

1. Open the frontend service.
2. Go to **Environment** → **Environment Variables**.
3. Add:

| Key | Value |
|---|---|
| `VITE_WS_URL` | `wss://ai-virtual-backend.onrender.com/ws` |

> **Important:** `VITE_WS_URL` is embedded by Vite **at build time**, so the
> service must be redeployed after you set it.  Click **"Manual Deploy"** →
> **"Deploy latest commit"** to trigger a fresh build.

---

## Step 4 – Verify the deployment

1. Open `https://ai-virtual-frontend.onrender.com` in your browser.
2. The avatar canvas should load and the status indicator should show
   *"Connecting…"* then *"Connected"*.
3. Click the microphone button and say something.  The avatar should respond.

If the frontend shows **"Cannot reach backend"**, check:
- `VITE_WS_URL` is set correctly and the frontend was rebuilt after setting it.
- `ALLOWED_ORIGINS` on the backend includes the exact frontend URL.
- The backend service is running (check its **Logs** tab on Render).

---

## Manual deployment (without Blueprint)

If you prefer to create services manually instead of using the Blueprint:

### Backend

1. **New +** → **Web Service** → connect repo.
2. **Root Directory:** `backend`
3. **Runtime:** Python
4. **Build Command:** `pip install -r requirements.txt`
5. **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables as listed in Step 3.
7. Click **Create Web Service**.

### Frontend

1. **New +** → **Web Service** → connect repo.
2. **Root Directory:** `frontend`
3. **Runtime:** Node
4. **Build Command:** `npm install && npm run build`
5. **Start Command:** `npm run preview -- --host 0.0.0.0 --port $PORT`
6. Add `VITE_WS_URL` as listed in Step 3.
7. Click **Create Web Service**.

---

## Docker Compose (local development)

To run the full stack locally with Docker:

```bash
# 1. Copy the env example and fill in your keys
cp backend/.env.example backend/.env
# edit backend/.env and add your real API keys

# 2. (Optional) set a custom WebSocket URL for local Docker testing
#    Leave empty to use the nginx proxy (default)
export VITE_WS_URL=

# 3. Build and start both containers
docker-compose up --build
```

The frontend is served at <http://localhost:5173> and the backend at
<http://localhost:8000>.

---

## Environment variable reference

### Backend (`backend/.env` or Render environment)

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | – | Claude LLM access |
| `DEEPGRAM_API_KEY` | ✅ | – | Speech-to-Text |
| `ELEVENLABS_API_KEY` | ✅ | – | Text-to-Speech |
| `BACKEND_URL` | ✅ prod | `http://localhost:8000` | Public URL of this service |
| `ALLOWED_ORIGINS` | ✅ prod | `http://localhost:5173,...` | Comma-separated CORS origins |

### Frontend (`frontend/.env` or Render environment)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_WS_URL` | ✅ prod | (derived from window.location) | WebSocket base URL, e.g. `wss://...onrender.com/ws` |
| `VITE_API_URL` | dev only | `http://localhost:8000` | Dev-proxy target for Vite's HMR proxy |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Avatar stuck on "Connecting…" | Wrong `VITE_WS_URL` | Set correct URL and redeploy frontend |
| CORS error in browser console | Missing `ALLOWED_ORIGINS` | Add frontend URL to `ALLOWED_ORIGINS` on backend |
| Backend crashes on startup | Missing API key | Add all three API keys in Render environment |
| Microphone not working | Browser security | Site must be served over **HTTPS** (Render provides this automatically) |
| Free tier spin-down latency | Free plan | Upgrade to Starter or use a cron keep-alive ping |
