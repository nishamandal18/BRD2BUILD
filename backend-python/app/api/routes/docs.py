"""AI software documentation generation routes (Feature 3)."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import get_documentation_service
from app.core.logging import get_logger
from app.models.docs_schemas import (
    DocsJobListResponse,
    DocsJobStatus,
    DocsJobStatusResponse,
    GenerateDocumentationRequest,
    GenerateDocumentationResponse,
    UploadRepositoryResponse,
)
from app.services.documentation_service import DocumentationService

logger = get_logger(__name__)

router = APIRouter(tags=["AI Documentation"])


@router.post(
    "/upload-repository",
    response_model=UploadRepositoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Python files or a repository ZIP for documentation",
)
async def upload_repository(
    files: Optional[List[UploadFile]] = File(
        default=None,
        description="One or more .py files, or a single .zip repository",
    ),
    file: Optional[UploadFile] = File(
        default=None,
        description="Optional single-file alias",
    ),
    service: DocumentationService = Depends(get_documentation_service),
) -> UploadRepositoryResponse:
    uploads: List[UploadFile] = []
    if files:
        uploads.extend(files)
    if file is not None:
        uploads.append(file)
    if not uploads:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": {
                    "code": "validation_error",
                    "message": "Missing upload. Send multipart/form-data with field 'files' or 'file'.",
                    "details": {"expected_fields": ["files", "file"]},
                }
            },
        )

    payload = []
    for f in uploads:
        content = await f.read()
        payload.append((f.filename or "upload.bin", content, f.content_type))
    logger.info("upload-repository received %s file(s)", len(payload))
    return await service.upload_repository(payload)


@router.post(
    "/generate-documentation",
    response_model=GenerateDocumentationResponse,
    summary="Analyze repository and generate documentation via Vertex AI",
)
async def generate_documentation(
    body: GenerateDocumentationRequest,
    background_tasks: BackgroundTasks,
    service: DocumentationService = Depends(get_documentation_service),
) -> GenerateDocumentationResponse:
    if body.background:
        # Ensure job exists first
        record = await service.get_job(body.job_id)
        if record.status in {DocsJobStatus.COMPLETED}:
            return GenerateDocumentationResponse(
                job_id=record.job_id,
                status=record.status,
                project_name=record.documentation.project_name if record.documentation else None,
                download_url=f"/download?job_id={record.job_id}",
                message="Documentation already completed",
                documentation=record.documentation,
            )

        record.status = DocsJobStatus.GENERATING
        record.error = None
        await service.store.save(record)

        async def _run() -> None:
            try:
                await service.generate_documentation(
                    body.job_id,
                    project_name=body.project_name,
                    include_html=body.include_html,
                    extra_instructions=body.extra_instructions,
                )
            except Exception:
                logger.exception("Background documentation failed job_id=%s", body.job_id)

        background_tasks.add_task(_run)
        return GenerateDocumentationResponse(
            job_id=body.job_id,
            status=DocsJobStatus.GENERATING,
            project_name=body.project_name,
            download_url=f"/download?job_id={body.job_id}",
            message="Documentation generation started in background. Poll GET /documentation/jobs/{job_id}.",
            documentation=None,
        )

    return await service.generate_documentation(
        body.job_id,
        project_name=body.project_name,
        include_html=body.include_html,
        extra_instructions=body.extra_instructions,
    )


@router.get(
    "/download",
    summary="Download generated documentation bundle (ZIP: Markdown + JSON + HTML)",
    response_class=FileResponse,
)
async def download_documentation(
    job_id: str,
    service: DocumentationService = Depends(get_documentation_service),
) -> FileResponse:
    record = await service.get_job(job_id)
    path = service.get_download_path(record)
    return FileResponse(
        path=path,
        media_type="application/zip",
        filename=f"documentation_{job_id}.zip",
    )




@router.get(
    "/documentation/jobs",
    response_model=DocsJobListResponse,
    summary="List documentation generation jobs",
)
async def list_documentation_jobs(
    service: DocumentationService = Depends(get_documentation_service),
) -> DocsJobListResponse:
    """Return in-memory documentation jobs (cleared on server restart)."""
    return await service.list_jobs()


@router.get(
    "/documentation/jobs/{job_id}",
    response_model=DocsJobStatusResponse,
    summary="Get documentation job status",
)
async def get_documentation_job(
    job_id: str,
    service: DocumentationService = Depends(get_documentation_service),
) -> DocsJobStatusResponse:
    record = await service.get_job(job_id)
    return DocsJobStatusResponse(
        job_id=record.job_id,
        status=record.status,
        file_count=record.file_count,
        project_name=record.documentation.project_name if record.documentation else None,
        error=record.error,
        download_url=f"/download?job_id={record.job_id}"
        if record.status == DocsJobStatus.COMPLETED
        else None,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
