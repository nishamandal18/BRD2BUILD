"""Pydantic models for requests, analysis, and generation results."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class JobStatus(str, Enum):
    UPLOADED = "uploaded"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class FunctionInfo(BaseModel):
    name: str
    qualified_name: str
    lineno: int
    end_lineno: Optional[int] = None
    args: List[str] = Field(default_factory=list)
    defaults_count: int = 0
    is_async: bool = False
    is_method: bool = False
    decorators: List[str] = Field(default_factory=list)
    docstring: Optional[str] = None
    raises: List[str] = Field(default_factory=list)
    calls: List[str] = Field(default_factory=list)
    has_db_interaction: bool = False
    has_external_api_call: bool = False
    complexity_hints: List[str] = Field(default_factory=list)


class ClassInfo(BaseModel):
    name: str
    lineno: int
    end_lineno: Optional[int] = None
    bases: List[str] = Field(default_factory=list)
    methods: List[FunctionInfo] = Field(default_factory=list)
    decorators: List[str] = Field(default_factory=list)
    docstring: Optional[str] = None


class APIEndpointInfo(BaseModel):
    framework: str
    method: str
    path: str
    handler: str
    lineno: int
    decorators: List[str] = Field(default_factory=list)


class FileAnalysis(BaseModel):
    path: str
    module: str
    lines_of_code: int
    imports: List[str] = Field(default_factory=list)
    functions: List[FunctionInfo] = Field(default_factory=list)
    classes: List[ClassInfo] = Field(default_factory=list)
    api_endpoints: List[APIEndpointInfo] = Field(default_factory=list)
    exceptions_raised: List[str] = Field(default_factory=list)
    db_interactions: List[str] = Field(default_factory=list)
    external_api_calls: List[str] = Field(default_factory=list)
    business_logic_notes: List[str] = Field(default_factory=list)
    parse_error: Optional[str] = None


class RepoAnalysis(BaseModel):
    job_id: str
    files: List[FileAnalysis] = Field(default_factory=list)
    total_functions: int = 0
    total_classes: int = 0
    total_api_endpoints: int = 0
    summary: Dict[str, Any] = Field(default_factory=dict)


class GeneratedTestFile(BaseModel):
    relative_path: str
    content: str
    source_modules: List[str] = Field(default_factory=list)


class CoverageEstimate(BaseModel):
    estimated_line_coverage_percent: float = 0.0
    estimated_branch_coverage_percent: float = 0.0
    covered_functions: List[str] = Field(default_factory=list)
    uncovered_functions: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class GenerationReport(BaseModel):
    coverage: CoverageEstimate
    missing_edge_cases: List[str] = Field(default_factory=list)
    testing_recommendations: List[str] = Field(default_factory=list)
    framework: str = "pytest"
    generated_at: datetime = Field(default_factory=utc_now)


class JobRecord(BaseModel):
    job_id: str = Field(default_factory=new_id)
    status: JobStatus = JobStatus.UPLOADED
    original_filenames: List[str] = Field(default_factory=list)
    source_root: str
    output_root: str
    file_count: int = 0
    analysis: Optional[RepoAnalysis] = None
    test_files: List[GeneratedTestFile] = Field(default_factory=list)
    report: Optional[GenerationReport] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    def touch(self) -> None:
        self.updated_at = utc_now()


class UploadResponse(BaseModel):
    job_id: str
    status: JobStatus
    file_count: int
    files: List[str]
    message: str


class GenerateTestsRequest(BaseModel):
    job_id: str = Field(..., description="Job ID returned by /upload-code")
    include_integration_style: bool = Field(
        default=False,
        description="If true, include broader integration-oriented tests where useful",
    )
    test_style: str = Field(
        default="unit",
        description="unit | mixed",
    )


class GenerateTestsResponse(BaseModel):
    job_id: str
    status: JobStatus
    test_files: List[GeneratedTestFile]
    report: GenerationReport
    download_url: str
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    file_count: int
    test_file_count: int = 0
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    environment: str


class JobListItem(BaseModel):
    """Summary row for GET /jobs (unit-test history)."""

    job_id: str
    status: JobStatus
    file_count: int = 0
    test_file_count: int = 0
    original_filenames: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobListResponse(BaseModel):
    jobs: List[JobListItem]
    total: int

