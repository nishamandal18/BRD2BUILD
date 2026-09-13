"""Orchestrates PRD upload → text extraction → LLM Jira backlog generation."""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

import aiofiles

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    FileTooLargeError,
    GenerationError,
    JobNotFoundError,
    UnsupportedFileTypeError,
    ValidationFailedError,
)
from app.core.logging import get_logger
from app.models.prd_schemas import (
    AnalyzePrdResponse,
    JiraBacklog,
    JiraEpic,
    JiraStory,
    PrdJobListItem,
    PrdJobListResponse,
    PrdJobRecord,
    PrdJobStatus,
    PrdUploadResponse,
    Priority,
)
from app.services.document_extractor import extract_text_from_bytes
from app.services.vertex_ai_service import VertexAIService
from app.storage.prd_memory_store import InMemoryPrdJobStore

logger = get_logger(__name__)

FIBONACCI = {1, 2, 3, 5, 8, 13, 21}


def _safe_name(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name) or "prd.bin"


def _extension(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def _nearest_fibonacci(value: int) -> int:
    if value in FIBONACCI:
        return value
    return min(FIBONACCI, key=lambda f: (abs(f - value), f))


def _normalize_priority(raw: object) -> Priority:
    if isinstance(raw, Priority):
        return raw
    text = str(raw or "Medium").strip().capitalize()
    mapping = {
        "Critical": Priority.CRITICAL,
        "High": Priority.HIGH,
        "Medium": Priority.MEDIUM,
        "Low": Priority.LOW,
        "Highest": Priority.CRITICAL,
        "Lowest": Priority.LOW,
    }
    return mapping.get(text, Priority.MEDIUM)


class PrdAnalyzerService:
    def __init__(
        self,
        store: Optional[InMemoryPrdJobStore] = None,
        settings: Optional[Settings] = None,
        llm: Optional[VertexAIService] = None,
    ) -> None:
        self.store = store or InMemoryPrdJobStore()
        self.settings = settings or get_settings()
        self.llm = llm or VertexAIService(self.settings)
        self.settings.prd_upload_dir.mkdir(parents=True, exist_ok=True)
        self.settings.prd_generated_dir.mkdir(parents=True, exist_ok=True)

    def _job_paths(self, job_id: str) -> Tuple[Path, Path]:
        source_dir = self.settings.prd_upload_dir / job_id
        output_root = self.settings.prd_generated_dir / job_id
        return source_dir, output_root

    async def upload_prd(
        self,
        filename: str,
        content: bytes,
        content_type: Optional[str] = None,
    ) -> PrdUploadResponse:
        if not filename:
            raise ValidationFailedError("Filename is required")

        safe = _safe_name(filename)
        ext = _extension(safe)
        allowed = self.settings.prd_allowed_extension_list
        if ext not in allowed:
            raise UnsupportedFileTypeError(safe, allowed)

        size = len(content)
        if size > self.settings.max_upload_size_bytes:
            raise FileTooLargeError(size, self.settings.max_upload_size_bytes)
        if size == 0:
            raise ValidationFailedError("Uploaded PRD file is empty")

        job_id = str(uuid.uuid4())
        source_dir, output_root = self._job_paths(job_id)
        source_dir.mkdir(parents=True, exist_ok=True)
        output_root.mkdir(parents=True, exist_ok=True)

        dest = source_dir / safe
        async with aiofiles.open(dest, "wb") as f:
            await f.write(content)

        record = PrdJobRecord(
            job_id=job_id,
            status=PrdJobStatus.UPLOADED,
            original_filename=safe,
            content_type=content_type,
            source_path=str(dest),
            output_root=str(output_root),
        )
        await self.store.save(record)
        logger.info("PRD uploaded job_id=%s file=%s bytes=%s", job_id, safe, size)
        return PrdUploadResponse(
            job_id=job_id,
            status=record.status,
            filename=safe,
            message="PRD uploaded successfully. Call POST /prd/analyze to generate Jira work items.",
        )

    async def analyze_prd(
        self,
        job_id: str,
        *,
        project_name_hint: Optional[str] = None,
        extra_instructions: Optional[str] = None,
    ) -> AnalyzePrdResponse:
        record = await self.get_job(job_id)
        source = Path(record.source_path)
        if not source.exists():
            raise ValidationFailedError(
                "Uploaded PRD file is missing on disk",
                details={"job_id": job_id, "path": record.source_path},
            )

        try:
            record.status = PrdJobStatus.EXTRACTING
            record.error = None
            await self.store.save(record)

            raw = source.read_bytes()
            text = extract_text_from_bytes(record.original_filename, raw)
            if len(text) > self.settings.max_prd_chars:
                logger.warning(
                    "Truncating PRD text job_id=%s from %s to %s chars",
                    job_id,
                    len(text),
                    self.settings.max_prd_chars,
                )
                text = text[: self.settings.max_prd_chars]

            record.extracted_char_count = len(text)
            record.extracted_text_preview = text[:500]
            output_root = Path(record.output_root)
            output_root.mkdir(parents=True, exist_ok=True)
            (output_root / "extracted_text.txt").write_text(text, encoding="utf-8")

            record.status = PrdJobStatus.ANALYZING
            await self.store.save(record)

            payload = await self.llm.generate_jira_from_prd(
                prd_text=text,
                project_name_hint=project_name_hint,
                extra_instructions=extra_instructions,
            )
            backlog = self._normalize_backlog(payload, project_name_hint=project_name_hint)
            if not backlog.epics:
                raise GenerationError("LLM returned no epics for the PRD")

            (output_root / "backlog.json").write_text(
                backlog.model_dump_json(indent=2),
                encoding="utf-8",
            )

            record.backlog = backlog
            record.status = PrdJobStatus.COMPLETED
            record.error = None
            await self.store.save(record)

            story_count = sum(len(e.stories) for e in backlog.epics)
            logger.info(
                "PRD analysis complete job_id=%s epics=%s stories=%s",
                job_id,
                len(backlog.epics),
                story_count,
            )
            return AnalyzePrdResponse(
                job_id=job_id,
                status=record.status,
                project_name=backlog.project_name,
                epic_count=len(backlog.epics),
                story_count=story_count,
                backlog=backlog,
                message="Jira work items generated successfully",
            )
        except Exception as exc:
            logger.exception("PRD analysis failed job_id=%s", job_id)
            record.status = PrdJobStatus.FAILED
            record.error = str(exc)
            await self.store.save(record)
            raise

    def _normalize_backlog(
        self,
        payload: dict,
        *,
        project_name_hint: Optional[str] = None,
    ) -> JiraBacklog:
        project_name = str(payload.get("project_name") or project_name_hint or "Untitled Project").strip()
        epics_raw = payload.get("epics") or []
        if not isinstance(epics_raw, list):
            raise GenerationError("LLM JSON 'epics' must be a list")

        epics: List[JiraEpic] = []
        for epic_item in epics_raw:
            if not isinstance(epic_item, dict):
                continue
            title = str(epic_item.get("title") or "").strip()
            if not title:
                continue
            description = str(epic_item.get("description") or "").strip()
            stories_raw = epic_item.get("stories") or []
            stories: List[JiraStory] = []
            if isinstance(stories_raw, list):
                for story_item in stories_raw:
                    story = self._normalize_story(story_item)
                    if story:
                        stories.append(story)
            epics.append(JiraEpic(title=title, description=description, stories=stories))

        return JiraBacklog(project_name=project_name, epics=epics)

    def _normalize_story(self, item: object) -> Optional[JiraStory]:
        if not isinstance(item, dict):
            return None
        title = str(item.get("title") or "").strip()
        if not title:
            return None
        description = str(item.get("description") or "").strip()

        try:
            points = int(item.get("story_points") or 5)
        except (TypeError, ValueError):
            points = 5
        points = max(1, points)
        points = _nearest_fibonacci(points)

        labels = item.get("labels") or []
        components = item.get("components") or []
        dependencies = item.get("dependencies") or []
        criteria = item.get("acceptance_criteria") or []

        if not isinstance(labels, list):
            labels = []
        if not isinstance(components, list):
            components = []
        if not isinstance(dependencies, list):
            dependencies = []
        if not isinstance(criteria, list):
            criteria = [str(criteria)] if criteria else []

        # Support object-style AC: {given, when, then}
        normalized_ac: List[str] = []
        for ac in criteria:
            if isinstance(ac, dict):
                given = str(ac.get("given") or ac.get("Given") or "").strip()
                when = str(ac.get("when") or ac.get("When") or "").strip()
                then = str(ac.get("then") or ac.get("Then") or "").strip()
                if given or when or then:
                    normalized_ac.append(f"Given {given}\nWhen {when}\nThen {then}".strip())
            else:
                text = str(ac).strip()
                if text:
                    normalized_ac.append(text)

        return JiraStory(
            title=title,
            description=description,
            story_points=points,
            priority=_normalize_priority(item.get("priority")),
            labels=[str(x).strip() for x in labels if str(x).strip()],
            components=[str(x).strip() for x in components if str(x).strip()],
            dependencies=[str(x).strip() for x in dependencies if str(x).strip()],
            acceptance_criteria=normalized_ac,
        )

    async def get_job(self, job_id: str) -> PrdJobRecord:
        record = await self.store.get(job_id)
        if not record:
            raise JobNotFoundError(job_id)
        return record

    async def list_jobs(self) -> PrdJobListResponse:
        records = await self.store.list()
        items: List[PrdJobListItem] = []
        for r in records:
            epic_count = len(r.backlog.epics) if r.backlog else 0
            story_count = sum(len(e.stories) for e in r.backlog.epics) if r.backlog else 0
            items.append(
                PrdJobListItem(
                    job_id=r.job_id,
                    status=r.status,
                    original_filename=r.original_filename,
                    project_name=r.backlog.project_name if r.backlog else None,
                    epic_count=epic_count,
                    story_count=story_count,
                    created_at=r.created_at,
                    updated_at=r.updated_at,
                )
            )
        return PrdJobListResponse(jobs=items, total=len(items))

    def get_backlog_path(self, record: PrdJobRecord) -> Path:
        path = Path(record.output_root) / "backlog.json"
        if not path.exists():
            raise ValidationFailedError(
                "Backlog not available. Analyze the PRD first.",
                details={"job_id": record.job_id, "status": record.status},
            )
        return path
