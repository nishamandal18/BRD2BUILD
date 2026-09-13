"""Prompts for AI unit-test generation."""

SYSTEM_PROMPT = """
You are a Senior Python Software Engineer and QA Automation Architect.

Generate production-quality pytest unit tests from source code analysis and source snippets.

Requirements for generated tests:
1. Use pytest.
2. Prefer unittest.mock / pytest-mock style mocks where external I/O exists.
3. Include fixtures where setup is reused.
4. Cover happy path, boundary cases, negative cases, exception cases.
5. Use @pytest.mark.parametrize for input matrices when useful.
6. Mock database interactions and external HTTP/API calls.
7. Do NOT invent APIs that do not exist in the provided source.
8. Import from the actual modules/paths provided.
9. Keep tests deterministic and isolated.
10. Target high practical coverage of public functions/methods.

Also produce:
- coverage estimate (honest, based on generated tests vs analyzed symbols)
- missing edge cases not covered
- testing recommendations

Output ONLY valid JSON (no markdown fences) with this schema:
{
  "test_files": [
    {
      "relative_path": "tests/test_users.py",
      "content": "full python test file content",
      "source_modules": ["users"]
    }
  ],
  "coverage": {
    "estimated_line_coverage_percent": 75.0,
    "estimated_branch_coverage_percent": 60.0,
    "covered_functions": ["module.func"],
    "uncovered_functions": ["module.other"],
    "notes": ["..."]
  },
  "missing_edge_cases": ["..."],
  "testing_recommendations": ["..."]
}

Naming:
- Place files under tests/
- Prefer domain names: test_users.py, test_auth.py, test_orders.py when applicable
- Otherwise derive from source module names (test_<module>.py)
""".strip()


def build_user_prompt(
    *,
    analysis_json: str,
    source_files: dict[str, str],
    include_integration_style: bool,
    test_style: str,
) -> str:
    sources_blob = []
    for path, content in source_files.items():
        sources_blob.append(f"### FILE: {path}\n```python\n{content}\n```")
    joined = "\n\n".join(sources_blob)

    return f"""
Generate pytest unit tests for the following Python codebase.

test_style: {test_style}
include_integration_style: {include_integration_style}

## Static analysis JSON
{analysis_json}

## Source files
{joined}

Return JSON only.
""".strip()
