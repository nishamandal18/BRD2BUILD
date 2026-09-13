"""Orchestrates repository upload → AST → Vertex AI docs → package artifacts."""

from __future__ import annotations

import html
import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

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
from app.models.docs_schemas import (
    ClassDoc,
    DocumentationBundle,
    DocsJobListItem,
    DocsJobListResponse,
    DocsJobRecord,
    DocsJobStatus,
    FunctionDoc,
    GenerateDocumentationResponse,
    ModuleDoc,
    UploadRepositoryResponse,
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
from app.storage.docs_memory_store import InMemoryDocsJobStore

logger = get_logger(__name__)

DOC_MARKDOWN_FILES = {
    "readme_md": "README.md",
    "api_documentation_md": "API_DOCUMENTATION.md",
    "class_documentation_md": "CLASS_DOCUMENTATION.md",
    "function_documentation_md": "FUNCTION_DOCUMENTATION.md",
    "module_documentation_md": "MODULE_DOCUMENTATION.md",
    "architecture_summary_md": "ARCHITECTURE_SUMMARY.md",
    "dependency_graph_md": "DEPENDENCY_GRAPH.md",
    "sequence_flow_md": "SEQUENCE_FLOW.md",
    "release_notes_md": "RELEASE_NOTES.md",
    "installation_guide_md": "INSTALLATION_GUIDE.md",
    "usage_guide_md": "USAGE_GUIDE.md",
    "folder_structure_md": "FOLDER_STRUCTURE.md",
}


def _safe_name(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name) or "upload.bin"


def _extension(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def _build_folder_tree(root: Path, *, max_entries: int = 200) -> str:
    lines: List[str] = [root.name or "repo"]
    count = 0
    if not root.exists():
        return "(empty)"
    for path in sorted(root.rglob("*")):
        if count >= max_entries:
            lines.append("... truncated ...")
            break
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        if any(p in {".git", "__pycache__", ".venv", "venv", "node_modules"} for p in rel.parts):
            continue
        depth = len(rel.parts)
        indent = "  " * depth
        suffix = "/" if path.is_dir() else ""
        lines.append(f"{indent}{rel.name}{suffix}")
        count += 1
    return "\n".join(lines)


def _markdown_to_pdf_ready_html(title: str, sections: Dict[str, str]) -> str:
    """Lightweight PDF-ready HTML (print CSS). Not a full markdown renderer."""
    body_parts: List[str] = []
    for heading, md in sections.items():
        body_parts.append(f"<section><h2>{html.escape(heading)}</h2>")
        # Preserve markdown as preformatted content for reliable PDF printing.
        body_parts.append(f"<pre class=\"md\">{html.escape(md)}</pre></section>")
    body = "\n".join(body_parts)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)}</title>
  <style>
    @page {{ margin: 2cm; }}
    body {{ font-family: Georgia, 'Times New Roman', serif; color: #111; line-height: 1.45; }}
    h1 {{ border-bottom: 2px solid #333; padding-bottom: 0.3em; }}
    h2 {{ margin-top: 1.6em; color: #222; page-break-after: avoid; }}
    section {{ page-break-inside: avoid; margin-bottom: 1.2em; }}
    pre.md {{
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      background: #f7f7f7;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 12px;
    }}
    @media print {{
      a {{ color: inherit; text-decoration: none; }}
    }}
  </style>
</head>
<body>
  <h1>{html.escape(title)} — Documentation</h1>
  <p>PDF-ready HTML export. Use browser Print → Save as PDF.</p>
  {body}
</body>
</html>
"""


class DocumentationService:
    def __init__(
        self,
        store: Optional[InMemoryDocsJobStore] = None,
        settings: Optional[Settings] = None,
        llm: Optional[VertexAIService] = None,
    ) -> None:
        self.store = store or InMemoryDocsJobStore()
        self.settings = settings or get_settings()
        self.llm = llm or VertexAIService(self.settings)
        self.settings.docs_upload_dir.mkdir(parents=True, exist_ok=True)
        self.settings.docs_generated_dir.mkdir(parents=True, exist_ok=True)

    def _job_paths(self, job_id: str) -> Tuple[Path, Path, Path]:
        source_root = self.settings.docs_upload_dir / job_id / "source"
        output_root = self.settings.docs_generated_dir / job_id
        raw_dir = self.settings.docs_upload_dir / job_id / "raw"
        return source_root, output_root, raw_dir

    async def upload_repository(
        self,
        files: Sequence[tuple[str, bytes, Optional[str]]],
    ) -> UploadRepositoryResponse:
        if not files:
            raise ValidationFailedError("At least one file is required")

        job_id = str(uuid.uuid4())
        source_root, output_root, raw_dir = self._job_paths(job_id)
        raw_dir.mkdir(parents=True, exist_ok=True)
        source_root.mkdir(parents=True, exist_ok=True)
        output_root.mkdir(parents=True, exist_ok=True)

        allowed = self.settings.docs_allowed_extension_list
        total_bytes = sum(len(content) for _, content, _ in files)
        if total_bytes > self.settings.max_upload_size_bytes:
            raise FileTooLargeError(total_bytes, self.settings.max_upload_size_bytes)

        saved_names: List[str] = []
        python_sources: Dict[str, str] = {}
        zip_extracted = False
        git_meta: Optional[dict] = None

        for filename, content, _content_type in files:
            safe = _safe_name(filename)
            ext = _extension(safe)
            if ext not in allowed:
                raise UnsupportedFileTypeError(safe, allowed)

            raw_path = raw_dir / safe
            async with aiofiles.open(raw_path, "wb") as f:
                await f.write(content)
            saved_names.append(safe)

            if ext == "zip":
                if len(files) > 1:
                    raise ValidationFailedError(
                        "Upload either a single ZIP repository or multiple .py files, not both"
                    )
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
                # best-effort preserve folder tree from extract root
                tree = _build_folder_tree(root)
                (output_root / "folder_tree.txt").write_text(tree, encoding="utf-8")
            elif ext == "py":
                text = content.decode("utf-8", errors="replace")
                if len(text) > self.settings.max_source_chars_per_file:
                    text = text[: self.settings.max_source_chars_per_file] + "\n# ... truncated ...\n"
                python_sources[safe] = text
            else:
                raise UnsupportedFileTypeError(safe, allowed)

        if not zip_extracted:
            if not python_sources:
                raise ValidationFailedError("No Python files found in upload")
            write_sources_to_job_dir(source_root, python_sources)
            tree = _build_folder_tree(source_root)
            (output_root / "folder_tree.txt").write_text(tree, encoding="utf-8")

        if git_meta:
            (output_root / "git_metadata.json").write_text(
                json.dumps(git_meta, indent=2),
                encoding="utf-8",
            )

        record = DocsJobRecord(
            job_id=job_id,
            status=DocsJobStatus.UPLOADED,
            original_filenames=saved_names,
            source_root=str(source_root),
            output_root=str(output_root),
            file_count=len(python_sources),
            git_metadata=git_meta,
        )
        await self.store.save(record)
        logger.info("Docs upload complete job_id=%s files=%s", job_id, record.file_count)

        return UploadRepositoryResponse(
            job_id=job_id,
            status=record.status,
            file_count=record.file_count,
            files=sorted(python_sources.keys()),
            message="Repository uploaded successfully. Call POST /generate-documentation next.",
        )

    async def generate_documentation(
        self,
        job_id: str,
        *,
        project_name: Optional[str] = None,
        include_html: bool = True,
        extra_instructions: Optional[str] = None,
    ) -> GenerateDocumentationResponse:
        record = await self.get_job(job_id)
        source_root = Path(record.source_root)
        output_root = Path(record.output_root)
        if not source_root.exists():
            raise ValidationFailedError(
                "Source files missing on disk",
                details={"job_id": job_id, "source_root": str(source_root)},
            )

        try:
            record.status = DocsJobStatus.ANALYZING
            record.error = None
            await self.store.save(record)

            sources = read_python_sources(
                source_root,
                max_files=self.settings.max_files_per_job,
                max_chars_per_file=self.settings.max_source_chars_per_file,
                max_total_chars=self.settings.max_total_source_chars,
            )
            analysis = analyze_repository(job_id, sources)
            (output_root / "analysis.json").write_text(
                analysis.model_dump_json(indent=2),
                encoding="utf-8",
            )

            record.status = DocsJobStatus.GENERATING
            await self.store.save(record)

            folder_tree = ""
            tree_path = output_root / "folder_tree.txt"
            if tree_path.exists():
                folder_tree = tree_path.read_text(encoding="utf-8")

            git_json = None
            if record.git_metadata:
                git_json = json.dumps(record.git_metadata, indent=2)

            payload = await self.llm.generate_documentation_payload(
                analysis_json=analysis.model_dump_json(),
                source_files=sources,
                project_name=project_name,
                git_metadata_json=git_json,
                folder_tree=folder_tree or None,
                extra_instructions=extra_instructions,
            )
            bundle = self._normalize_bundle(payload, project_name_hint=project_name)
            self._write_artifacts(output_root, bundle, include_html=include_html)

            # Package zip for download
            package_tests_zip(output_root, output_root / "documentation_bundle.zip")

            record.documentation = bundle
            record.status = DocsJobStatus.COMPLETED
            record.error = None
            await self.store.save(record)

            logger.info("Documentation complete job_id=%s project=%s", job_id, bundle.project_name)
            return GenerateDocumentationResponse(
                job_id=job_id,
                status=record.status,
                project_name=bundle.project_name,
                download_url=f"/download?job_id={job_id}",
                message="Documentation generated successfully",
                documentation=bundle,
            )
        except Exception as exc:
            logger.exception("Documentation generation failed job_id=%s", job_id)
            record.status = DocsJobStatus.FAILED
            record.error = str(exc)
            await self.store.save(record)
            raise

    def _normalize_bundle(
        self,
        payload: Dict[str, Any],
        *,
        project_name_hint: Optional[str] = None,
    ) -> DocumentationBundle:
        if not isinstance(payload, dict):
            raise GenerationError("LLM documentation payload must be an object")

        project_name = str(
            payload.get("project_name") or project_name_hint or "Project"
        ).strip() or "Project"

        def _md(key: str) -> str:
            return str(payload.get(key) or "").strip()

        functions: List[FunctionDoc] = []
        for item in payload.get("functions") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            params = item.get("parameters") or []
            if not isinstance(params, list):
                params = [str(params)]
            exceptions = item.get("possible_exceptions") or []
            if not isinstance(exceptions, list):
                exceptions = [str(exceptions)]
            functions.append(
                FunctionDoc(
                    name=name,
                    qualified_name=str(item.get("qualified_name") or name),
                    purpose=str(item.get("purpose") or ""),
                    parameters=[str(p) for p in params],
                    return_type=str(item.get("return_type") or "Any"),
                    example=str(item.get("example") or ""),
                    possible_exceptions=[str(e) for e in exceptions],
                    module=str(item.get("module") or ""),
                )
            )

        classes: List[ClassDoc] = []
        for item in payload.get("classes") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            methods_raw = item.get("methods") or []
            methods: List[FunctionDoc] = []
            if isinstance(methods_raw, list):
                for m in methods_raw:
                    if isinstance(m, dict) and str(m.get("name") or "").strip():
                        methods.append(
                            FunctionDoc(
                                name=str(m.get("name")),
                                qualified_name=str(m.get("qualified_name") or m.get("name") or ""),
                                purpose=str(m.get("purpose") or ""),
                                parameters=[str(p) for p in (m.get("parameters") or [])]
                                if isinstance(m.get("parameters"), list)
                                else [],
                                return_type=str(m.get("return_type") or "Any"),
                                example=str(m.get("example") or ""),
                                possible_exceptions=[str(e) for e in (m.get("possible_exceptions") or [])]
                                if isinstance(m.get("possible_exceptions"), list)
                                else [],
                                module=str(m.get("module") or item.get("module") or ""),
                            )
                        )
                    elif isinstance(m, str) and m.strip():
                        methods.append(FunctionDoc(name=m.strip()))
            classes.append(
                ClassDoc(
                    name=name,
                    purpose=str(item.get("purpose") or ""),
                    methods=methods,
                    module=str(item.get("module") or ""),
                )
            )

        modules: List[ModuleDoc] = []
        for item in payload.get("modules") or []:
            if not isinstance(item, dict):
                continue
            path = str(item.get("path") or item.get("name") or "").strip()
            if not path:
                continue
            modules.append(
                ModuleDoc(
                    path=path,
                    name=str(item.get("name") or Path(path).stem),
                    purpose=str(item.get("purpose") or ""),
                    classes=[str(x) for x in (item.get("classes") or [])]
                    if isinstance(item.get("classes"), list)
                    else [],
                    functions=[str(x) for x in (item.get("functions") or [])]
                    if isinstance(item.get("functions"), list)
                    else [],
                )
            )

        metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}

        # Ensure structured function docs exist even if LLM only returned markdown
        if not functions and not _md("function_documentation_md"):
            raise GenerationError("LLM returned empty documentation content")

        return DocumentationBundle(
            project_name=project_name,
            readme_md=_md("readme_md"),
            api_documentation_md=_md("api_documentation_md"),
            class_documentation_md=_md("class_documentation_md"),
            function_documentation_md=_md("function_documentation_md"),
            module_documentation_md=_md("module_documentation_md"),
            architecture_summary_md=_md("architecture_summary_md"),
            dependency_graph_md=_md("dependency_graph_md"),
            sequence_flow_md=_md("sequence_flow_md"),
            release_notes_md=_md("release_notes_md"),
            installation_guide_md=_md("installation_guide_md"),
            usage_guide_md=_md("usage_guide_md"),
            folder_structure_md=_md("folder_structure_md"),
            functions=functions,
            classes=classes,
            modules=modules,
            metadata=metadata or {},
        )

    def _write_artifacts(
        self,
        output_root: Path,
        bundle: DocumentationBundle,
        *,
        include_html: bool,
    ) -> None:
        docs_dir = output_root / "docs"
        docs_dir.mkdir(parents=True, exist_ok=True)

        # JSON full bundle
        (output_root / "documentation.json").write_text(
            bundle.model_dump_json(indent=2),
            encoding="utf-8",
        )
        (docs_dir / "documentation.json").write_text(
            bundle.model_dump_json(indent=2),
            encoding="utf-8",
        )

        # Markdown files
        data = bundle.model_dump()
        sections_for_html: Dict[str, str] = {}
        for key, filename in DOC_MARKDOWN_FILES.items():
            content = str(data.get(key) or "").strip()
            if not content:
                content = f"# {filename}\n\n_No content generated._\n"
            (docs_dir / filename).write_text(content + ("\n" if not content.endswith("\n") else ""), encoding="utf-8")
            sections_for_html[filename.replace(".md", "").replace("_", " ")] = content

        # Structured function index markdown fallback enrichment
        if bundle.functions:
            lines = ["# Function Reference\n"]
            for fn in bundle.functions:
                lines.append(f"## `{fn.qualified_name or fn.name}`\n")
                lines.append(f"**Purpose:** {fn.purpose or 'N/A'}\n")
                lines.append("**Parameters:**")
                if fn.parameters:
                    for p in fn.parameters:
                        lines.append(f"- {p}")
                else:
                    lines.append("- None")
                lines.append(f"\n**Return Type:** `{fn.return_type}`\n")
                lines.append(f"**Example:**\n\n```python\n{fn.example or '# N/A'}\n```\n")
                lines.append("**Possible Exceptions:**")
                if fn.possible_exceptions:
                    for e in fn.possible_exceptions:
                        lines.append(f"- {e}")
                else:
                    lines.append("- None documented")
                lines.append("")
            fn_md = "\n".join(lines)
            (docs_dir / "FUNCTION_REFERENCE.md").write_text(fn_md, encoding="utf-8")
            # keep explicit structured JSON for functions
            (docs_dir / "functions.json").write_text(
                json.dumps([f.model_dump() for f in bundle.functions], indent=2),
                encoding="utf-8",
            )

        if include_html:
            html_doc = _markdown_to_pdf_ready_html(bundle.project_name, sections_for_html)
            (docs_dir / "documentation.html").write_text(html_doc, encoding="utf-8")
            (output_root / "documentation.html").write_text(html_doc, encoding="utf-8")

    async def get_job(self, job_id: str) -> DocsJobRecord:
        record = await self.store.get(job_id)
        if not record:
            raise JobNotFoundError(job_id)
        return record


    async def list_jobs(self) -> DocsJobListResponse:
        records = await self.store.list()
        items = [
            DocsJobListItem(
                job_id=r.job_id,
                status=r.status,
                file_count=r.file_count,
                original_filenames=list(r.original_filenames or []),
                project_name=r.documentation.project_name if r.documentation else None,
                error=r.error,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in records
        ]
        return DocsJobListResponse(jobs=items, total=len(items))

    def get_download_path(self, record: DocsJobRecord) -> Path:
        path = Path(record.output_root) / "documentation_bundle.zip"
        if not path.exists():
            raise ValidationFailedError(
                "Download not available. Generate documentation first.",
                details={"job_id": record.job_id, "status": record.status},
            )
        return path
