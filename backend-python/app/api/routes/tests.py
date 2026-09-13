"""Upload code, generate tests, download artifacts."""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import get_test_generator_service
from app.core.logging import get_logger
from app.models.schemas import (
    GenerateTestsRequest,
    GenerateTestsResponse,
    JobListResponse,
    JobStatusResponse,
    UploadResponse,
)
from app.services.test_generator_service import TestGeneratorService

logger = get_logger(__name__)

router = APIRouter(tags=["Unit Test Generation"])


@router.post(
    "/upload-code",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Python source files or a repository ZIP",
)
async def upload_code(
    files: Optional[List[UploadFile]] = File(
        default=None,
        description="One or more .py files, or a single .zip repo (field name: files)",
    ),
    file: Optional[UploadFile] = File(
        default=None,
        description="Optional single file alias (field name: file). Use files for multiple.",
    ),
    service: TestGeneratorService = Depends(get_test_generator_service),
) -> UploadResponse:
    """Accept multipart form field `files` and/or `file`."""
    from fastapi import HTTPException

    uploads: List[UploadFile] = []
    if files:
        uploads.extend(files)
    if file is not None:
        uploads.append(file)

    if not uploads:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": {
                    "code": "validation_error",
                    "message": (
                        "Missing upload. Send multipart/form-data with field "
                        "'files' (recommended) or 'file'. "
                        "Example: curl -F 'files=@code.py' http://localhost:8080/upload-code"
                    ),
                    "details": {
                        "expected_fields": ["files", "file"],
                        "content_type": "multipart/form-data",
                    },
                }
            },
        )

    payload = []
    for f in uploads:
        content = await f.read()
        payload.append((f.filename or "upload.bin", content, f.content_type))
    logger.info("upload-code received %s file(s)", len(payload))
    return await service.upload_code(payload)


@router.post(
    "/generate-tests",
    response_model=GenerateTestsResponse,
    summary="Analyze uploaded code and generate pytest suite via Vertex AI",
)
async def generate_tests(
    body: GenerateTestsRequest,
    service: TestGeneratorService = Depends(get_test_generator_service),
) -> GenerateTestsResponse:
    record = await service.generate_tests(
        body.job_id,
        include_integration_style=body.include_integration_style,
        test_style=body.test_style,
    )
    assert record.report is not None
    return GenerateTestsResponse(
        job_id=record.job_id,
        status=record.status,
        test_files=record.test_files,
        report=record.report,
        download_url=f"/download-tests?job_id={record.job_id}",
        message="Tests generated successfully",
    )


@router.get(
    "/download-tests",
    summary="Download generated tests as a ZIP bundle",
    response_class=FileResponse,
)
async def download_tests(
    job_id: str,
    service: TestGeneratorService = Depends(get_test_generator_service),
) -> FileResponse:
    record = await service.get_job(job_id)
    path = service.get_download_path(record)
    return FileResponse(
        path=path,
        media_type="application/zip",
        filename=f"tests_{job_id}.zip",
    )




@router.get(
    "/jobs",
    response_model=JobListResponse,
    summary="List unit-test generation jobs",
)
async def list_unit_test_jobs(
    service: TestGeneratorService = Depends(get_test_generator_service),
) -> JobListResponse:
    """Return in-memory unit-test jobs (cleared on server restart)."""
    return await service.list_jobs()


@router.get(
    "/jobs/{job_id}",
    response_model=JobStatusResponse,
    summary="Get job status",
)
async def get_job_status(
    job_id: str,
    service: TestGeneratorService = Depends(get_test_generator_service),
) -> JobStatusResponse:
    record = await service.get_job(job_id)
    return JobStatusResponse(
        job_id=record.job_id,
        status=record.status,
        file_count=record.file_count,
        test_file_count=len(record.test_files),
        error=record.error,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
