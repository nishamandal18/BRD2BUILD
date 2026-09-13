"""FastAPI application entrypoint for AI Unit Test Generator."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.generated_dir.mkdir(parents=True, exist_ok=True)
    settings.prd_upload_dir.mkdir(parents=True, exist_ok=True)
    settings.prd_generated_dir.mkdir(parents=True, exist_ok=True)
    settings.docs_upload_dir.mkdir(parents=True, exist_ok=True)
    settings.docs_generated_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Starting %s v%s", settings.app_name, settings.app_version)
    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description=(
        "Upload Python source code or a repository ZIP, analyze it with AST, "
        "and generate production-quality pytest suites using Google Vertex AI (Gemini). "
        "Returns tests, coverage estimates, missing edge cases, and recommendations. "
        "Also supports PRD upload (PDF/DOCX/TXT) and AI generation of Jira epics, "
        "user stories, acceptance criteria, story points, priorities, and dependencies. Also generates software documentation (README, API/class/function docs, architecture, dependency/sequence diagrams, release notes, install/usage guides) as Markdown, JSON, and PDF-ready HTML."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "routes": {
            "upload": "POST /upload-code",
            "generate": "POST /generate-tests",
            "download": "GET /download-tests?job_id=...",
            "health": "GET /health",
            "jobs_list": "GET /jobs",
            "prd_upload": "POST /prd/upload",
            "prd_analyze": "POST /prd/analyze",
            "prd_jobs": "GET /prd/jobs",
            "prd_download": "GET /prd/download?job_id=...",
            "upload_repository": "POST /upload-repository",
            "generate_documentation": "POST /generate-documentation",
            "download_docs": "GET /download?job_id=...",
            "docs_jobs_list": "GET /documentation/jobs",
            "docs_job": "GET /documentation/jobs/{job_id}",
        },
    }


def run() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.app_debug,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    run()
