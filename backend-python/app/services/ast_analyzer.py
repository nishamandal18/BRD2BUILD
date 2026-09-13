"""AST-based static analysis for Python source files."""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Iterable, List, Optional, Set

from app.core.logging import get_logger
from app.models.schemas import (
    APIEndpointInfo,
    ClassInfo,
    FileAnalysis,
    FunctionInfo,
    RepoAnalysis,
)

logger = get_logger(__name__)

DB_PATTERNS = re.compile(
    r"(sqlalchemy|session\.|\.execute\(|execute\(|cursor\.|mongodb|pymongo|redis|"
    r"django\.db|psycopg|asyncpg|sqlite3|create_engine|SessionLocal|\.query\(|"
    r"\.filter\(|\.commit\()",
    re.I,
)
HTTP_PATTERNS = re.compile(
    r"(requests\.|httpx\.|aiohttp|urllib\.|http\.client|ClientSession|"
    r"openai\.|boto3|stripe\.|twilio)",
    re.I,
)
FASTAPI_DECOR = re.compile(r"\.(get|post|put|patch|delete|options|head|api_route)\b", re.I)
FLASK_DECOR = re.compile(r"\.(route|get|post|put|patch|delete)\b", re.I)


def _name_of(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _name_of(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    if isinstance(node, ast.Call):
        return _name_of(node.func)
    if isinstance(node, ast.Subscript):
        return _name_of(node.value)
    return node.__class__.__name__


def _decorator_names(decorators: list[ast.AST]) -> List[str]:
    return [_name_of(d) for d in decorators]


def _docstring(node: ast.AST) -> Optional[str]:
    return ast.get_docstring(node)


def _collect_raises(node: ast.AST) -> List[str]:
    found: Set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Raise) and child.exc is not None:
            found.add(_name_of(child.exc))
    return sorted(found)


def _collect_calls(node: ast.AST) -> List[str]:
    found: Set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            found.add(_name_of(child.func))
    return sorted(found)


def _args_of(func: ast.AST) -> tuple[List[str], int]:
    if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return [], 0
    args = [a.arg for a in func.args.args]
    defaults = len(func.args.defaults or [])
    return args, defaults


def _complexity_hints(node: ast.AST) -> List[str]:
    hints: List[str] = []
    branches = sum(isinstance(n, (ast.If, ast.For, ast.While, ast.Try, ast.With, ast.BoolOp, ast.IfExp)) for n in ast.walk(node))
    if branches >= 8:
        hints.append("high_branching")
    elif branches >= 4:
        hints.append("moderate_branching")
    if any(isinstance(n, ast.Try) for n in ast.walk(node)):
        hints.append("has_try_except")
    if any(isinstance(n, (ast.For, ast.While, ast.AsyncFor, ast.ListComp, ast.DictComp)) for n in ast.walk(node)):
        hints.append("has_loops_or_comprehensions")
    return hints


def _detect_db_and_http(source: str, calls: Iterable[str]) -> tuple[bool, bool, List[str], List[str]]:
    call_blob = " ".join(calls)
    combined = f"{source}\n{call_blob}"
    db_hits = sorted(set(DB_PATTERNS.findall(combined)))
    http_hits = sorted(set(HTTP_PATTERNS.findall(combined)))
    # normalize regex group findings (some are strings with trailing chars)
    db_hits = [h.strip("().") for h in db_hits]
    http_hits = [h.strip("().") for h in http_hits]
    return bool(db_hits), bool(http_hits), db_hits, http_hits


def _extract_api_endpoints(tree: ast.AST, source_lines: List[str]) -> List[APIEndpointInfo]:
    endpoints: List[APIEndpointInfo] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            dname = _name_of(dec)
            framework = None
            method = "GET"
            path = "/"
            if FASTAPI_DECOR.search(dname) or dname.startswith("app.") or dname.startswith("router."):
                framework = "fastapi"
            if FLASK_DECOR.search(dname):
                framework = framework or "flask"
            if framework is None and any(x in dname for x in ("route", "api_route", "get", "post")):
                framework = "http"

            if framework is None:
                continue

            # method from decorator name
            lower = dname.lower()
            for m in ("get", "post", "put", "patch", "delete", "options", "head"):
                if lower.endswith(f".{m}") or f".{m}." in lower:
                    method = m.upper()
                    break
            if "route" in lower and isinstance(dec, ast.Call):
                # Flask style methods=["POST"]
                for kw in dec.keywords or []:
                    if kw.arg == "methods" and isinstance(kw.value, (ast.List, ast.Tuple)):
                        if kw.value.elts and isinstance(kw.value.elts[0], ast.Constant):
                            method = str(kw.value.elts[0].value).upper()

            if isinstance(dec, ast.Call) and dec.args:
                first = dec.args[0]
                if isinstance(first, ast.Constant) and isinstance(first.value, str):
                    path = first.value

            endpoints.append(
                APIEndpointInfo(
                    framework=framework,
                    method=method,
                    path=path,
                    handler=node.name,
                    lineno=node.lineno,
                    decorators=_decorator_names(node.decorator_list),
                )
            )
    return endpoints


def _function_info(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    *,
    parent_class: Optional[str],
    module: str,
    source: str,
) -> FunctionInfo:
    args, defaults_count = _args_of(node)
    calls = _collect_calls(node)
    raises = _collect_raises(node)
    has_db, has_http, _, _ = _detect_db_and_http(source, calls)
    qname = f"{module}.{parent_class}.{node.name}" if parent_class else f"{module}.{node.name}"
    return FunctionInfo(
        name=node.name,
        qualified_name=qname,
        lineno=node.lineno,
        end_lineno=getattr(node, "end_lineno", None),
        args=args,
        defaults_count=defaults_count,
        is_async=isinstance(node, ast.AsyncFunctionDef),
        is_method=parent_class is not None,
        decorators=_decorator_names(node.decorator_list),
        docstring=_docstring(node),
        raises=raises,
        calls=calls[:50],
        has_db_interaction=has_db,
        has_external_api_call=has_http,
        complexity_hints=_complexity_hints(node),
    )


def analyze_python_source(path: str, source: str) -> FileAnalysis:
    module = Path(path).with_suffix("").as_posix().replace("/", ".")
    if module.endswith(".__init__"):
        module = module[: -len(".__init__")]

    analysis = FileAnalysis(
        path=path,
        module=module,
        lines_of_code=len(source.splitlines()),
    )

    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        analysis.parse_error = f"SyntaxError: {exc}"
        logger.warning("Failed to parse %s: %s", path, exc)
        return analysis

    imports: List[str] = []
    for node in tree.body:
        if isinstance(node, ast.Import):
            imports.extend(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            for a in node.names:
                imports.append(f"{base}.{a.name}" if base else a.name)
    analysis.imports = sorted(set(imports))

    functions: List[FunctionInfo] = []
    classes: List[ClassInfo] = []

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(_function_info(node, parent_class=None, module=module, source=source))
        elif isinstance(node, ast.ClassDef):
            methods: List[FunctionInfo] = []
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods.append(
                        _function_info(child, parent_class=node.name, module=module, source=source)
                    )
            classes.append(
                ClassInfo(
                    name=node.name,
                    lineno=node.lineno,
                    end_lineno=getattr(node, "end_lineno", None),
                    bases=[_name_of(b) for b in node.bases],
                    methods=methods,
                    decorators=_decorator_names(node.decorator_list),
                    docstring=_docstring(node),
                )
            )

    analysis.functions = functions
    analysis.classes = classes
    analysis.api_endpoints = _extract_api_endpoints(tree, source.splitlines())

    all_raises: Set[str] = set()
    for f in functions:
        all_raises.update(f.raises)
    for c in classes:
        for m in c.methods:
            all_raises.update(m.raises)
    analysis.exceptions_raised = sorted(all_raises)

    all_calls: List[str] = []
    for f in functions:
        all_calls.extend(f.calls)
    for c in classes:
        for m in c.methods:
            all_calls.extend(m.calls)
    _, _, db_hits, http_hits = _detect_db_and_http(source, all_calls)
    analysis.db_interactions = db_hits
    analysis.external_api_calls = http_hits

    notes: List[str] = []
    if analysis.api_endpoints:
        notes.append(f"Detected {len(analysis.api_endpoints)} HTTP endpoint handlers")
    if db_hits:
        notes.append("Contains database interaction patterns")
    if http_hits:
        notes.append("Contains external API/HTTP client patterns")
    if any("high_branching" in f.complexity_hints for f in functions):
        notes.append("Some functions have high branching complexity")
    # business rules: condition-heavy public functions
    for f in functions:
        if f.name.startswith("_"):
            continue
        if "moderate_branching" in f.complexity_hints or "high_branching" in f.complexity_hints:
            notes.append(f"Business-rule candidate: {f.qualified_name}")
    analysis.business_logic_notes = notes[:30]

    return analysis


def analyze_repository(job_id: str, files: dict[str, str]) -> RepoAnalysis:
    analyses = [analyze_python_source(path, src) for path, src in sorted(files.items())]
    total_functions = 0
    total_classes = 0
    total_apis = 0
    for a in analyses:
        total_functions += len(a.functions) + sum(len(c.methods) for c in a.classes)
        total_classes += len(a.classes)
        total_apis += len(a.api_endpoints)

    return RepoAnalysis(
        job_id=job_id,
        files=analyses,
        total_functions=total_functions,
        total_classes=total_classes,
        total_api_endpoints=total_apis,
        summary={
            "file_count": len(analyses),
            "files_with_parse_errors": sum(1 for a in analyses if a.parse_error),
            "files_with_db": sum(1 for a in analyses if a.db_interactions),
            "files_with_external_api": sum(1 for a in analyses if a.external_api_calls),
        },
    )
