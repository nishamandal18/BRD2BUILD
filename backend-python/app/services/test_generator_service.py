"""Orchestrates upload → AST analysis → Vertex AI generation → package tests."""

from __future__ import annotations

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import List, Optional, Sequence

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
from app.models.schemas import (
    CoverageEstimate,
    GeneratedTestFile,
    GenerationReport,
    JobListItem,
    JobListResponse,
    JobRecord,
    JobStatus,
    UploadResponse,
)
from app.services.archive_service import (
    extract_zip,
    package_tests_zip,
    read_python_sources,
    try_git_metadata,
    write_sources_to_job_dir,
)
from app.services.ast_analyzer import analyze_repository
from app.services.vertex_ai_service import VertexAIService
from app.storage.base import JobStore
from app.storage.factory import get_job_store

logger = get_logger(__name__)


def _safe_name(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name) or "upload.bin"


def _extension(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


class TestGeneratorService:
    def __init__(
        self,
        store: Optional[JobStore] = None,
        settings: Optional[Settings] = None,
        llm: Optional[VertexAIService] = None,
    ) -> None:
        self.store = store or get_job_store()
        self.settings = settings or get_settings()
        self.llm = llm or VertexAIService(self.settings)
        self.settings.upload_dir.mkdir(parents=True, exist_ok=True)
        self.settings.generated_dir.mkdir(parents=True, exist_ok=True)

    def _job_paths(self, job_id: str) -> tuple[Path, Path, Path]:
        source_root = self.settings.upload_dir / job_id / "source"
        output_root = self.settings.generated_dir / job_id
        raw_dir = self.settings.upload_dir / job_id / "raw"
        return source_root, output_root, raw_dir

    async def upload_code(self, files: Sequence[tuple[str, bytes, Optional[str]]]) -> UploadResponse:
        if not files:
            raise ValidationFailedError("At least one file is required")

        job_id = str(uuid.uuid4())
        source_root, output_root, raw_dir = self._job_paths(job_id)
        raw_dir.mkdir(parents=True, exist_ok=True)
        source_root.mkdir(parents=True, exist_ok=True)
        output_root.mkdir(parents=True, exist_ok=True)

        saved_names: List[str] = []
        python_sources: dict[str, str] = {}
        zip_extracted = False

        total_bytes = sum(len(content) for _, content, _ in files)
        if total_bytes > self.settings.max_upload_size_bytes:
            raise FileTooLargeError(total_bytes, self.settings.max_upload_size_bytes)

        for filename, content, _content_type in files:
            safe = _safe_name(filename)
            ext = _extension(safe)
            if ext not in self.settings.allowed_extension_list:
                raise UnsupportedFileTypeError(safe, self.settings.allowed_extension_list)

            raw_path = raw_dir / safe
            async with aiofiles.open(raw_path, "wb") as f:
                await f.write(content)
            saved_names.append(safe)

            if ext == "zip":
                if zip_extracted or len(files) > 1:
                    # allow one zip per job for clarity
                    if len(files) > 1:
                        raise ValidationFailedError("Upload either a single ZIP repository or multiple .py files, not both")
                extract_root = raw_dir / "extracted"
                root = extract_zip(raw_path, extract_root)
                git_meta = try_git_metadata(root)
                sources = read_python_sources(
                    root,
                    max_files=self.settings.max_files_per_job,
                    max_chars_per_file=self.settings.max_source_chars_per_file,
                    max_total_chars=self.settings.max_total_source_chars,
                )
                write_sources_to_job_dir(source_root, sources)
                python_sources = sources
                zip_extracted = True
                if git_meta:
                    (output_root / "git_metadata.json").write_text(
                        json.dumps(git_meta, indent=2),
                        encoding="utf-8",
                    )
            elif ext == "py":
                # multi-file python upload
                rel = safe
                text = content.decode("utf-8", errors="replace")
                if len(text) > self.settings.max_source_chars_per_file:
                    text = text[: self.settings.max_source_chars_per_file] + "\n# ... truncated ...\n"
                python_sources[rel] = text
            else:
                raise UnsupportedFileTypeError(safe, self.settings.allowed_extension_list)

        if not zip_extracted:
            if not python_sources:
                raise ValidationFailedError("No Python files found in upload")
            write_sources_to_job_dir(source_root, python_sources)

        record = JobRecord(
            job_id=job_id,
            status=JobStatus.UPLOADED,
            original_filenames=saved_names,
            source_root=str(source_root),
            output_root=str(output_root),
            file_count=len(python_sources),
        )
        await self.store.save(record)
        logger.info("Upload complete job_id=%s files=%s", job_id, record.file_count)

        return UploadResponse(
            job_id=job_id,
            status=record.status,
            file_count=record.file_count,
            files=sorted(python_sources.keys()),
            message="Code uploaded successfully",
        )

    async def generate_tests(
        self,
        job_id: str,
        *,
        include_integration_style: bool = False,
        test_style: str = "unit",
    ) -> JobRecord:
        record = await self.store.get(job_id)
        if not record:
            raise JobNotFoundError(job_id)

        source_root = Path(record.source_root)
        output_root = Path(record.output_root)

        try:
            record.status = JobStatus.ANALYZING
            await self.store.save(record)

            sources = read_python_sources(
                source_root,
                max_files=self.settings.max_files_per_job,
                max_chars_per_file=self.settings.max_source_chars_per_file,
                max_total_chars=self.settings.max_total_source_chars,
            )
            analysis = analyze_repository(job_id, sources)
            record.analysis = analysis
            await self.store.save(record)
            logger.info(
                "Analysis done job_id=%s functions=%s classes=%s apis=%s",
                job_id,
                analysis.total_functions,
                analysis.total_classes,
                analysis.total_api_endpoints,
            )

            record.status = JobStatus.GENERATING
            await self.store.save(record)

            payload = await self.llm.generate_tests_payload(
                analysis_json=analysis.model_dump_json(),
                source_files=sources,
                include_integration_style=include_integration_style,
                test_style=test_style,
            )

            test_files = self._normalize_test_files(payload.get("test_files") or [])
            if not test_files:
                raise GenerationError("LLM returned no test files")

            # Write to output/tests
            tests_dir = output_root / self.settings.tests_subdir
            if tests_dir.exists():
                shutil.rmtree(tests_dir)
            tests_dir.mkdir(parents=True, exist_ok=True)
            (tests_dir / "__init__.py").write_text("", encoding="utf-8")

            written: List[GeneratedTestFile] = []
            for tf in test_files:
                rel = tf.relative_path.replace("\\", "/").lstrip("/")
                if not rel.startswith("tests/"):
                    rel = f"tests/{Path(rel).name}"
                # ensure .py
                if not rel.endswith(".py"):
                    rel = f"{rel}.py"
                abs_path = output_root / rel
                abs_path.parent.mkdir(parents=True, exist_ok=True)
                abs_path.write_text(tf.content, encoding="utf-8")
                written.append(
                    GeneratedTestFile(
                        relative_path=rel,
                        content=tf.content,
                        source_modules=tf.source_modules,
                    )
                )

            report = GenerationReport(
                coverage=CoverageEstimate(**(payload.get("coverage") or {})),
                missing_edge_cases=list(payload.get("missing_edge_cases") or []),
                testing_recommendations=list(payload.get("testing_recommendations") or []),
            )
            # Persist report
            (output_root / "report.json").write_text(report.model_dump_json(indent=2), encoding="utf-8")
            (output_root / "analysis.json").write_text(analysis.model_dump_json(indent=2), encoding="utf-8")

            # Zip package
            package_tests_zip(output_root, output_root / "tests_bundle.zip")

            record.test_files = written
            record.report = report
            record.status = JobStatus.COMPLETED
            record.error = None
            await self.store.save(record)
            logger.info("Generation complete job_id=%s test_files=%s", job_id, len(written))
            return record
        except Exception as exc:
            logger.exception("Generation failed job_id=%s", job_id)
            record.status = JobStatus.FAILED
            record.error = str(exc)
            await self.store.save(record)
            raise

    def _normalize_test_files(self, items: list) -> List[GeneratedTestFile]:
        result: List[GeneratedTestFile] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            path = str(item.get("relative_path") or "").strip()
            content = str(item.get("content") or "")
            if not path or not content.strip():
                continue
            modules = item.get("source_modules") or []
            if not isinstance(modules, list):
                modules = []
            result.append(
                GeneratedTestFile(
                    relative_path=path,
                    content=content,
                    source_modules=[str(m) for m in modules],
                )
            )
        return result

    async def get_job(self, job_id: str) -> JobRecord:
        record = await self.store.get(job_id)
        if not record:
            raise JobNotFoundError(job_id)
        return record


    async def list_jobs(self) -> JobListResponse:
        records = await self.store.list()
        items = [
            JobListItem(
                job_id=r.job_id,
                status=r.status,
                file_count=r.file_count,
                test_file_count=len(r.test_files),
                original_filenames=list(r.original_filenames or []),
                error=r.error,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in records
        ]
        return JobListResponse(jobs=items, total=len(items))

    def get_download_path(self, record: JobRecord) -> Path:
        path = Path(record.output_root) / "tests_bundle.zip"
        if not path.exists():
            raise ValidationFailedError(
                "Download not available. Generate tests first.",
                details={"job_id": record.job_id, "status": record.status},
            )
        return path
