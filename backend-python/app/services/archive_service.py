"""Handle ZIP extraction and optional git metadata via GitPython."""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.core.exceptions import ValidationFailedError
from app.core.logging import get_logger

logger = get_logger(__name__)

SKIP_DIR_NAMES = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "venv",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    "node_modules",
    "dist",
    "build",
    ".tox",
}


def _should_skip(path: Path) -> bool:
    return any(part in SKIP_DIR_NAMES for part in path.parts)


def extract_zip(zip_path: Path, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            # Zip-slip protection
            for member in zf.infolist():
                member_path = Path(member.filename)
                if member_path.is_absolute() or ".." in member_path.parts:
                    raise ValidationFailedError(
                        f"Unsafe path in ZIP: {member.filename}",
                        details={"filename": member.filename},
                    )
            zf.extractall(dest_dir)
    except zipfile.BadZipFile as exc:
        raise ValidationFailedError("Invalid ZIP archive") from exc

    # If ZIP contains a single top-level folder, use it as root
    children = [p for p in dest_dir.iterdir() if not p.name.startswith(".")]
    if len(children) == 1 and children[0].is_dir():
        return children[0]
    return dest_dir


def collect_python_files(root: Path, *, max_files: int) -> List[Path]:
    files: List[Path] = []
    for path in sorted(root.rglob("*.py")):
        if _should_skip(path.relative_to(root)):
            continue
        if path.name.startswith("test_"):
            # allow analyzing source only; skip existing tests by default
            continue
        if path.parts and path.parts[0] == "tests" or "tests" in path.parts:
            continue
        files.append(path)
        if len(files) > max_files:
            raise ValidationFailedError(
                f"Too many Python files (>{max_files})",
                details={"max_files": max_files},
            )
    return files


def read_python_sources(
    root: Path,
    *,
    max_files: int,
    max_chars_per_file: int,
    max_total_chars: int,
) -> Dict[str, str]:
    files = collect_python_files(root, max_files=max_files)
    if not files:
        raise ValidationFailedError("No Python source files found to analyze")

    sources: Dict[str, str] = {}
    total = 0
    for path in files:
        rel = path.relative_to(root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="latin-1")
        if len(text) > max_chars_per_file:
            text = text[:max_chars_per_file] + "\n# ... truncated ...\n"
        total += len(text)
        if total > max_total_chars:
            logger.warning("Total source char limit reached; stopping at %s files", len(sources))
            break
        sources[rel] = text
    if not sources:
        raise ValidationFailedError("No readable Python source content found")
    return sources


def try_git_metadata(repo_path: Path) -> Optional[dict]:
    """Best-effort git metadata using GitPython if .git exists."""
    git_dir = repo_path / ".git"
    # Sometimes root is parent after zip extract
    if not git_dir.exists():
        # search one level
        for child in repo_path.iterdir() if repo_path.is_dir() else []:
            if (child / ".git").exists():
                repo_path = child
                break
        else:
            return None
    try:
        from git import Repo  # GitPython

        repo = Repo(str(repo_path), search_parent_directories=True)
        head = None
        try:
            head = repo.head.commit.hexsha
        except Exception:
            head = None
        return {
            "git_present": True,
            "active_branch": str(repo.active_branch) if not repo.head.is_detached else "DETACHED",
            "commit": head,
            "is_dirty": repo.is_dirty(untracked_files=True),
            "remotes": [r.url for r in repo.remotes],
        }
    except Exception as exc:
        logger.info("Git metadata unavailable: %s", exc)
        return {"git_present": True, "error": str(exc)}


def write_sources_to_job_dir(job_source_dir: Path, sources: Dict[str, str]) -> None:
    if job_source_dir.exists():
        shutil.rmtree(job_source_dir)
    job_source_dir.mkdir(parents=True, exist_ok=True)
    for rel, content in sources.items():
        dest = job_source_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")


def package_tests_zip(output_root: Path, zip_path: Path) -> Path:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    base = output_root
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(base.rglob("*")):
            if path.is_file():
                zf.write(path, arcname=path.relative_to(base).as_posix())
    return zip_path
