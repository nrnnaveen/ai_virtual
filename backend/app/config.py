from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str
    DEEPGRAM_API_KEY: str
    ELEVENLABS_API_KEY: str

    # URL of this backend service – exposed to the frontend as a build hint
    # and used in documentation.  Override via the BACKEND_URL env var in
    # production (e.g. https://ai-virtual-backend.onrender.com).
    BACKEND_URL: str = "http://localhost:8000"

    model_config = SettingsConfigDict(
        # .env file is optional – production environments inject vars directly.
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()
