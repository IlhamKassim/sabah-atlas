from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ATLAS_", env_file=REPO_ROOT / ".env", extra="ignore")

    lake_dir: Path = REPO_ROOT / "data" / "lake"
    database_url: str = "postgresql+psycopg://atlas:atlas@localhost:5433/atlas"
    # Web app's static data (GeoJSON, per-release JSON) is written here by `atlas publish`.
    web_public_dir: Path = REPO_ROOT / "apps" / "web" / "public" / "data"
    user_agent: str = "AtlasEkonomiSabah/0.1 (+https://github.com/IlhamKassim/sabah-atlas)"

    @property
    def bronze(self) -> Path:
        return self.lake_dir / "bronze"

    @property
    def silver(self) -> Path:
        return self.lake_dir / "silver"

    @property
    def gold(self) -> Path:
        return self.lake_dir / "gold"


@lru_cache
def get_settings() -> Settings:
    return Settings()
