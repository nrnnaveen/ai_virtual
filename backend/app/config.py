from pathlib import Path

from pydantic_settings import BaseSettings


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str
    DEEPGRAM_API_KEY: str
    ELEVENLABS_API_KEY: str

    class Config:
        env_file = str(ENV_FILE)


settings = Settings()
