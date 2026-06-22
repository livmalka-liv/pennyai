from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "PennyAI API"
    debug: bool = False
    api_version: str = "v1"

    # Database
    database_url: str = "postgresql://pennyai:password@localhost:5432/pennyai"

    # Redis (Celery broker)
    redis_url: str = "redis://localhost:6379/0"

    # LLM
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    use_mock_llm: bool = True  # True = no API calls, uses regex parser

    # Data providers
    polygon_api_key: str = ""
    databento_api_key: str = ""
    use_mock_data: bool = True  # True = use synthetic penny stock data

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_tester_monthly: str = ""
    stripe_price_pro_monthly: str = ""
    stripe_price_elite_monthly: str = ""
    stripe_price_elite_yearly: str = ""

    # Email reports (SMTP)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    report_email: str = ""   # defaults to smtp_user if blank

    # Auth
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours

    # Backtesting limits by tier
    max_backtests_tester_monthly: int = 20
    max_lookback_years_tester: int = 1
    max_lookback_years_pro: int = 5
    min_timeframe_tester: str = "1D"  # Daily only for tester

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
