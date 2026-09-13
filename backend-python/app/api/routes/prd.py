"""PRD upload and Jira work-item generation routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import get_prd_analyzer_service
from app.core.logging import get_logger
from app.models.prd_schemas import (
    AnalyzePrdRequest,
    AnalyzePrdResponse,
    PrdJobListResponse,
    PrdJobStatusResponse,
    PrdUploadResponse,
)
from app.services.prd_analyzer_service import PrdAnalyzerService

logger = get_logger(__name__)

router = APIRouter(prefix="/prd", tags=["PRD to Jira"])


@router.post(
    "/upload",
    response_model=PrdUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PRD document (PDF, DOCX, TXT, MD)",
)
async def upload_prd(
    file: UploadFile = File(..., description="PRD file: .pdf, .docx, .txt, or .md"),
    service: PrdAnalyzerService = Depends(get_prd_analyzer_service),
) -> PrdUploadResponse:
    content = await file.read()
    logger.info("prd/upload received file=%s", file.filename)
    return await service.upload_prd(
        filename=file.filename or "prd.txt",
        content=content,
        content_type=file.content_type,
    )


@router.post(
    "/analyze",
    response_model=AnalyzePrdResponse,
    summary="Extract PRD text and generate Jira epics/stories via Vertex AI",
)
async def analyze_prd(
    body: AnalyzePrdRequest,
    service: PrdAnalyzerService = Depends(get_prd_analyzer_service),
) -> AnalyzePrdResponse:
    return await service.analyze_prd(
        body.job_id,
        project_name_hint=body.project_name_hint,
        extra_instructions=body.extra_instructions,
    )


@router.get(
    "/jobs",
    response_model=PrdJobListResponse,
    summary="List PRD analysis jobs",
)
async def list_prd_jobs(
    service: PrdAnalyzerService = Depends(get_prd_analyzer_service),
) -> PrdJobListResponse:
    return await service.list_jobs()


@router.get(
    "/jobs/{job_id}",
    response_model=PrdJobStatusResponse,
    summary="Get PRD job status and generated backlog",
)
async def get_prd_job(
    job_id: str,
    service: PrdAnalyzerService = Depends(get_prd_analyzer_service),
) -> PrdJobStatusResponse:
    record = await service.get_job(job_id)
    epic_count = len(record.backlog.epics) if record.backlog else 0
    story_count = sum(len(e.stories) for e in record.backlog.epics) if record.backlog else 0
    return PrdJobStatusResponse(
        job_id=record.job_id,
        status=record.status,
        original_filename=record.original_filename,
        extracted_char_count=record.extracted_char_count,
        epic_count=epic_count,
        story_count=story_count,
        backlog=record.backlog,
        error=record.error,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get(
    "/download",
    summary="Download generated Jira backlog JSON",
    response_class=FileResponse,
)
async def download_prd_backlog(
    job_id: str,
    service: PrdAnalyzerService = Depends(get_prd_analyzer_service),
) -> FileResponse:
    record = await service.get_job(job_id)
    path = service.get_backlog_path(record)
    return FileResponse(
        path=path,
        media_type="application/json",
        filename=f"jira_backlog_{job_id}.json",
    )
