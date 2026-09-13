"""Pydantic models for PRD upload and Jira work-item generation."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.schemas import new_id, utc_now


class PrdJobStatus(str, Enum):
    UPLOADED = "uploaded"
    EXTRACTING = "extracting"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


class Priority(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class JiraStory(BaseModel):
    title: str
    description: str
    story_points: int = Field(default=5, description="Fibonacci story points")
    priority: Priority = Priority.MEDIUM
    labels: List[str] = Field(default_factory=list)
    components: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(
        default_factory=list,
        description="Titles or keys of stories this depends on",
    )
    acceptance_criteria: List[str] = Field(
        default_factory=list,
        description="Gherkin Given/When/Then strings or multi-line scenarios",
    )


class JiraEpic(BaseModel):
    title: str
    description: str
    stories: List[JiraStory] = Field(default_factory=list)


class JiraBacklog(BaseModel):
    project_name: str
    epics: List[JiraEpic] = Field(default_factory=list)


class PrdJobRecord(BaseModel):
    job_id: str = Field(default_factory=new_id)
    status: PrdJobStatus = PrdJobStatus.UPLOADED
    original_filename: str = ""
    content_type: Optional[str] = None
    source_path: str = ""
    output_root: str = ""
    extracted_text_preview: Optional[str] = None
    extracted_char_count: int = 0
    backlog: Optional[JiraBacklog] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    def touch(self) -> None:
        self.updated_at = utc_now()


class PrdUploadResponse(BaseModel):
    job_id: str
    status: PrdJobStatus
    filename: str
    message: str


class AnalyzePrdRequest(BaseModel):
    job_id: str = Field(..., description="Job ID returned by POST /prd/upload")
    project_name_hint: Optional[str] = Field(
        default=None,
        description="Optional project name hint for the LLM",
    )
    extra_instructions: Optional[str] = Field(
        default=None,
        description="Optional extra product/context instructions for analysis",
    )


class AnalyzePrdResponse(BaseModel):
    job_id: str
    status: PrdJobStatus
    project_name: str
    epic_count: int
    story_count: int
    backlog: JiraBacklog
    message: str


class PrdJobStatusResponse(BaseModel):
    job_id: str
    status: PrdJobStatus
    original_filename: str
    extracted_char_count: int = 0
    epic_count: int = 0
    story_count: int = 0
    backlog: Optional[JiraBacklog] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PrdJobListItem(BaseModel):
    job_id: str
    status: PrdJobStatus
    original_filename: str
    project_name: Optional[str] = None
    epic_count: int = 0
    story_count: int = 0
    created_at: datetime
    updated_at: datetime


class PrdJobListResponse(BaseModel):
    jobs: List[PrdJobListItem]
    total: int
