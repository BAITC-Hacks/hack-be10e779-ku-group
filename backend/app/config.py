"""Настройки приложения из переменных окружения (.env). Используется во всех модулях через `settings`."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    app_mode: str = "demo"  # demo | live; без ключа всегда demo
    llm_api_key: str = ""
    llm_model: str = "gpt-5.4-mini"
    llm_base_url: str = ""  # пусто — OpenAI; иначе любой OpenAI-совместимый API (например, NVIDIA NIM)
    llm_timeout_s: float = 60.0
    database_url: str = f"sqlite:///{ROOT_DIR / 'data' / 'app.db'}"
    ai_cache_dir: Path = ROOT_DIR / "data" / "ai-cache"
    static_dir: Path = ROOT_DIR / "frontend" / "dist"
    build_commit: str = "dev"

    @property
    def live(self) -> bool:
        return self.app_mode == "live" and bool(self.llm_api_key)


settings = Settings()
