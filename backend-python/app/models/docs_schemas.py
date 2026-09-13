"""Pydantic models for AI software documentation generation."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.schemas import new_id, utc_now


class DocsJobStatus(str, Enum):
    UPLOADED = "uploaded"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class FunctionDoc(BaseModel):
    name: str
    qualified_name: str = ""
    purpose: str = ""
    parameters: List[str] = Field(default_factory=list)
    return_type: str = "Any"
    example: str = ""
    possible_exceptions: List[str] = Field(default_factory=list)
    module: str = ""


class ClassDoc(BaseModel):
    name: str
    purpose: str = ""
    methods: List[FunctionDoc] = Field(default_factory=list)
    module: str = ""


class ModuleDoc(BaseModel):
    path: str
    name: str
    purpose: str = ""
    classes: List[str] = Field(default_factory=list)
    functions: List[str] = Field(default_factory=list)


class DocumentationBundle(BaseModel):
    project_name: str = "Project"
    readme_md: str = ""
    api_documentation_md: str = ""
    class_documentation_md: str = ""
    function_documentation_md: str = ""
    module_documentation_md: str = ""
    architecture_summary_md: str = ""
    dependency_graph_md: str = ""
    sequence_flow_md: str = ""
    release_notes_md: str = ""
    installation_guide_md: str = ""
    usage_guide_md: str = ""
    folder_structure_md: str = ""
    functions: List[FunctionDoc] = Field(default_factory=list)
    classes: List[ClassDoc] = Field(default_factory=list)
    modules: List[ModuleDoc] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DocsJobRecord(BaseModel):
    job_id: str = Field(default_factory=new_id)
    status: DocsJobStatus = DocsJobStatus.UPLOADED
    original_filenames: List[str] = Field(default_factory=list)
    source_root: str = ""
    output_root: str = ""
    file_count: int = 0
    git_metadata: Optional[Dict[str, Any]] = None
    documentation: Optional[DocumentationBundle] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    def touch(self) -> None:
        self.updated_at = utc_now()


class UploadRepositoryResponse(BaseModel):
    job_id: str
    status: DocsJobStatus
    file_count: int
    files: List[str]
    message: str


class GenerateDocumentationRequest(BaseModel):
    job_id: str = Field(..., description="Job ID from POST /upload-repository")
    project_name: Optional[str] = Field(default=None, description="Optional project name hint")
    include_html: bool = Field(default=True, description="Also generate PDF-ready HTML")
    background: bool = Field(
        default=False,
        description="If true, run generation in background and return immediately",
    )
    extra_instructions: Optional[str] = None


class GenerateDocumentationResponse(BaseModel):
    job_id: str
    status: DocsJobStatus
    project_name: Optional[str] = None
    download_url: str
    message: str
    documentation: Optional[DocumentationBundle] = None


class DocsJobStatusResponse(BaseModel):
    job_id: str
    status: DocsJobStatus
    file_count: int = 0
    project_name: Optional[str] = None
    error: Optional[str] = None
    download_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocsJobListItem(BaseModel):
    """Summary row for GET /documentation/jobs (docs history)."""

    job_id: str
    status: DocsJobStatus
    file_count: int = 0
    original_filenames: List[str] = Field(default_factory=list)
    project_name: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocsJobListResponse(BaseModel):
    jobs: List[DocsJobListItem]
    total: int

