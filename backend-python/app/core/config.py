"""Application configuration from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "AI Unit Test Generator"
    app_version: str = "1.0.0"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    app_debug: bool = Field(default=False, alias="APP_DEBUG")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8080, alias="PORT")
    api_prefix: str = Field(default="", alias="API_PREFIX")
    cors_origins: str = Field(default="*", alias="CORS_ORIGINS")

    # Vertex AI (Gemini)
    vertex_project_id: str = Field(default="", alias="VERTEX_PROJECT_ID")
    vertex_location: str = Field(default="us-central1", alias="VERTEX_LOCATION")
    vertex_model: str = Field(default="gemini-2.5-pro", alias="VERTEX_MODEL")
    vertex_temperature: float = Field(default=0.2, alias="VERTEX_TEMPERATURE")
    vertex_max_output_tokens: int = Field(default=8192, alias="VERTEX_MAX_OUTPUT_TOKENS")

    # Retry
    retry_attempts: int = Field(default=3, alias="RETRY_ATTEMPTS")
    retry_min_wait_seconds: float = Field(default=1.0, alias="RETRY_MIN_WAIT_SECONDS")
    retry_max_wait_seconds: float = Field(default=8.0, alias="RETRY_MAX_WAIT_SECONDS")

    # Storage paths
    upload_dir: Path = Field(default=Path("uploads"), alias="UPLOAD_DIR")
    generated_dir: Path = Field(default=Path("generated"), alias="GENERATED_DIR")
    max_upload_size_mb: int = Field(default=50, alias="MAX_UPLOAD_SIZE_MB")
    allowed_extensions: str = Field(
        default="py,zip",
        alias="ALLOWED_EXTENSIONS",
    )
    max_files_per_job: int = Field(default=200, alias="MAX_FILES_PER_JOB")
    max_source_chars_per_file: int = Field(default=40_000, alias="MAX_SOURCE_CHARS_PER_FILE")
    max_total_source_chars: int = Field(default=200_000, alias="MAX_TOTAL_SOURCE_CHARS")

    # Generation
    tests_subdir: str = Field(default="tests", alias="TESTS_SUBDIR")

    # PRD → Jira generation (additive feature)
    prd_upload_dir: Path = Field(default=Path("uploads/prd"), alias="PRD_UPLOAD_DIR")
    prd_generated_dir: Path = Field(default=Path("generated/prd"), alias="PRD_GENERATED_DIR")
    prd_allowed_extensions: str = Field(
        default="pdf,docx,txt,md",
        alias="PRD_ALLOWED_EXTENSIONS",
    )
    max_prd_chars: int = Field(default=150_000, alias="MAX_PRD_CHARS")


    # AI Documentation generation (Feature 3)
    docs_upload_dir: Path = Field(default=Path("uploads/docs"), alias="DOCS_UPLOAD_DIR")
    docs_generated_dir: Path = Field(default=Path("generated/docs"), alias="DOCS_GENERATED_DIR")
    docs_allowed_extensions: str = Field(default="py,zip", alias="DOCS_ALLOWED_EXTENSIONS")

    include_coverage_hints: bool = Field(default=True, alias="INCLUDE_COVERAGE_HINTS")

    @property
    def cors_origin_list(self) -> List[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_extension_list(self) -> List[str]:
        return [e.strip().lower().lstrip(".") for e in self.allowed_extensions.split(",") if e.strip()]


    @property
    def prd_allowed_extension_list(self) -> List[str]:
        return [e.strip().lower().lstrip(".") for e in self.prd_allowed_extensions.split(",") if e.strip()]


    @property
    def docs_allowed_extension_list(self) -> List[str]:
        return [e.strip().lower().lstrip(".") for e in self.docs_allowed_extensions.split(",") if e.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
