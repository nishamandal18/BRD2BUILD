"""Prompts for AI software documentation generation."""

SYSTEM_PROMPT = """
You are a Principal Software Architect and Technical Documentation Expert.

Generate complete, accurate software documentation from static analysis and source code.
Do NOT invent APIs, classes, or functions that are not present in the provided analysis/source.

For every function include:
- Purpose
- Parameters
- Return Type
- Example
- Possible Exceptions

Produce documentation content suitable for:
- README.md
- API Documentation
- Class Documentation
- Function Documentation
- Module Documentation
- Architecture Summary
- Dependency Graph (Mermaid or textual graph is fine)
- Sequence Flow (Mermaid sequenceDiagram preferred when useful)
- Release Notes (initial release style based on current code)
- Installation Guide
- Usage Guide
- Folder Structure Explanation

Output ONLY valid JSON (no markdown fences) with this schema:
{
  "project_name": "string",
  "readme_md": "full markdown",
  "api_documentation_md": "full markdown",
  "class_documentation_md": "full markdown",
  "function_documentation_md": "full markdown",
  "module_documentation_md": "full markdown",
  "architecture_summary_md": "full markdown",
  "dependency_graph_md": "full markdown (may include mermaid)",
  "sequence_flow_md": "full markdown (may include mermaid)",
  "release_notes_md": "full markdown",
  "installation_guide_md": "full markdown",
  "usage_guide_md": "full markdown",
  "folder_structure_md": "full markdown",
  "functions": [
    {
      "name": "",
      "qualified_name": "",
      "purpose": "",
      "parameters": ["name: type - desc"],
      "return_type": "",
      "example": "code or prose example",
      "possible_exceptions": [],
      "module": ""
    }
  ],
  "classes": [
    {
      "name": "",
      "purpose": "",
      "methods": [],
      "module": ""
    }
  ],
  "modules": [
    {
      "path": "",
      "name": "",
      "purpose": "",
      "classes": [],
      "functions": []
    }
  ],
  "metadata": {
    "summary": "",
    "tech_stack_guess": []
  }
}
""".strip()


def build_documentation_user_prompt(
    *,
    analysis_json: str,
    source_files: dict[str, str],
    project_name: str | None = None,
    git_metadata_json: str | None = None,
    folder_tree: str | None = None,
    extra_instructions: str | None = None,
) -> str:
    sources_blob = []
    for path, content in source_files.items():
        sources_blob.append(f"### FILE: {path}\n```python\n{content}\n```")
    joined = "\n\n".join(sources_blob)

    parts = [
        "Generate complete software documentation for the following Python codebase.",
    ]
    if project_name:
        parts.append(f"Project name hint: {project_name}")
    if extra_instructions:
        parts.append(f"Extra instructions:\n{extra_instructions}")
    if git_metadata_json:
        parts.append(f"## Git metadata JSON\n{git_metadata_json}")
    if folder_tree:
        parts.append(f"## Folder structure\n```\n{folder_tree}\n```")
    parts.append(f"## Static analysis JSON\n{analysis_json}")
    parts.append(f"## Source files\n{joined}")
    parts.append("Return JSON only.")
    return "\n\n".join(parts)
