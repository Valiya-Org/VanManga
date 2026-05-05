from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    # Server
    host: str = "0.0.0.0"
    port: int = 5000

    # Storage
    database_path: str = "./data/vanmanga.db"
    manga_base_path: str = "./manga"
    log_path: str = "./logs/app.log"

    # Auth mode: "token" | "jwt"
    auth_mode: str = "token"
    admin_token: str | None = None  # pre-set token for token mode

    # JWT (external IdP, only used when auth_mode=jwt)
    jwt_jwks_url: str | None = None
    jwt_secret: str | None = None
    jwt_algorithm: str = "RS256"
    jwt_admin_claim: str = "role"
    jwt_admin_value: str = "admin"


@lru_cache
def get_settings() -> Settings:
    return Settings()
