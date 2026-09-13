from functools import lru_cache

from app.core.config import Settings, get_settings
from app.services.documentation_service import DocumentationService
from app.services.prd_analyzer_service import PrdAnalyzerService
from app.services.test_generator_service import TestGeneratorService


@lru_cache
def get_test_generator_service() -> TestGeneratorService:
    return TestGeneratorService()


@lru_cache
def get_prd_analyzer_service() -> PrdAnalyzerService:
    return PrdAnalyzerService()


def get_app_settings() -> Settings:
    return get_settings()


@lru_cache
def get_documentation_service() -> DocumentationService:
    return DocumentationService()
