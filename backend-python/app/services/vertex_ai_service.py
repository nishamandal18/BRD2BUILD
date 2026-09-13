"""Google Vertex AI (Gemini) client with retry for test generation, PRD analysis, and documentation."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Dict, Optional

from app.core.config import Settings, get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.core.retry import async_retry
from app.prompts.prd_analysis import SYSTEM_PROMPT as PRD_SYSTEM_PROMPT
from app.prompts.prd_analysis import build_prd_user_prompt
from app.prompts.test_generation import SYSTEM_PROMPT, build_user_prompt
from app.prompts.documentation import SYSTEM_PROMPT as DOCS_SYSTEM_PROMPT, build_documentation_user_prompt

logger = get_logger(__name__)

_vertex_initialized = False


def _strip_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def extract_json_object(text: str) -> Dict[str, Any]:
    cleaned = _strip_fences(text)
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end <= start:
        raise LLMError(
            "Vertex AI response did not contain a JSON object",
            details={"preview": cleaned[:400]},
        )
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise LLMError(
            f"Failed to parse Vertex AI JSON: {exc}",
            details={"preview": cleaned[:400]},
        ) from exc
    if not isinstance(data, dict):
        raise LLMError("Vertex AI JSON root must be an object")
    return data


class VertexAIService:
    """LLM service backed by Vertex AI Gemini models."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()

    def _ensure_init(self) -> None:
        global _vertex_initialized
        project = (self.settings.vertex_project_id or "").strip()
        location = (self.settings.vertex_location or "").strip()
        if not project:
            raise LLMError(
                "VERTEX_PROJECT_ID is not configured",
                details={
                    "hint": "Set VERTEX_PROJECT_ID in .env and authenticate with ADC "
                    "(gcloud auth application-default login) or GOOGLE_APPLICATION_CREDENTIALS"
                },
            )
        if not location:
            raise LLMError(
                "VERTEX_LOCATION is not configured",
                details={"hint": "Set VERTEX_LOCATION in .env (e.g. us-central1)"},
            )

        if _vertex_initialized:
            return

        try:
            import vertexai
        except ImportError as exc:
            raise LLMError(
                "google-cloud-aiplatform is not installed",
                details={"hint": "pip install google-cloud-aiplatform"},
            ) from exc

        try:
            vertexai.init(project=project, location=location)
            _vertex_initialized = True
            logger.info(
                "Vertex AI initialized project=%s location=%s",
                project,
                location,
            )
        except Exception as exc:  # noqa: BLE001
            raise LLMError(f"Failed to initialize Vertex AI: {exc}") from exc

    def _generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        self._ensure_init()
        try:
            from vertexai.generative_models import GenerationConfig, GenerativeModel
        except ImportError as exc:
            raise LLMError(
                "Vertex AI generative models unavailable",
                details={"hint": "pip install google-cloud-aiplatform"},
            ) from exc

        model_name = self.settings.vertex_model
        generation_config = GenerationConfig(
            temperature=self.settings.vertex_temperature,
            max_output_tokens=self.settings.vertex_max_output_tokens,
            response_mime_type="application/json",
        )

        try:
            model = GenerativeModel(
                model_name=model_name,
                system_instruction=[system_prompt],
            )
            response = model.generate_content(
                user_prompt,
                generation_config=generation_config,
            )
        except Exception as exc:  # noqa: BLE001
            raise LLMError(f"Vertex AI API call failed: {exc}") from exc

        content = getattr(response, "text", None)
        if not content:
            # Fallback: assemble candidates/parts if .text is empty
            try:
                parts = []
                for candidate in getattr(response, "candidates", None) or []:
                    content_obj = getattr(candidate, "content", None)
                    for part in getattr(content_obj, "parts", None) or []:
                        text = getattr(part, "text", None)
                        if text:
                            parts.append(text)
                content = "\n".join(parts).strip() if parts else None
            except Exception:  # noqa: BLE001
                content = None

        if not content:
            raise LLMError("Vertex AI returned an empty response")
        return extract_json_object(content)

    def _generate_tests_sync(
        self,
        *,
        analysis_json: str,
        source_files: dict[str, str],
        include_integration_style: bool,
        test_style: str,
    ) -> Dict[str, Any]:
        user_prompt = build_user_prompt(
            analysis_json=analysis_json,
            source_files=source_files,
            include_integration_style=include_integration_style,
            test_style=test_style,
        )
        return self._generate_json(system_prompt=SYSTEM_PROMPT, user_prompt=user_prompt)

    @async_retry(exceptions=(LLMError, TimeoutError, ConnectionError))
    async def generate_tests_payload(
        self,
        *,
        analysis_json: str,
        source_files: dict[str, str],
        include_integration_style: bool = False,
        test_style: str = "unit",
    ) -> Dict[str, Any]:
        logger.info(
            "Calling Vertex AI model=%s files=%s",
            self.settings.vertex_model,
            len(source_files),
        )
        return await asyncio.to_thread(
            self._generate_tests_sync,
            analysis_json=analysis_json,
            source_files=source_files,
            include_integration_style=include_integration_style,
            test_style=test_style,
        )

    def _generate_jira_sync(
        self,
        *,
        prd_text: str,
        project_name_hint: str | None = None,
        extra_instructions: str | None = None,
    ) -> Dict[str, Any]:
        user_prompt = build_prd_user_prompt(
            prd_text=prd_text,
            project_name_hint=project_name_hint,
            extra_instructions=extra_instructions,
        )
        return self._generate_json(system_prompt=PRD_SYSTEM_PROMPT, user_prompt=user_prompt)

    @async_retry(exceptions=(LLMError, TimeoutError, ConnectionError))
    async def generate_jira_from_prd(
        self,
        *,
        prd_text: str,
        project_name_hint: str | None = None,
        extra_instructions: str | None = None,
    ) -> Dict[str, Any]:
        logger.info(
            "Calling Vertex AI for PRD analysis model=%s chars=%s",
            self.settings.vertex_model,
            len(prd_text),
        )
        return await asyncio.to_thread(
            self._generate_jira_sync,
            prd_text=prd_text,
            project_name_hint=project_name_hint,
            extra_instructions=extra_instructions,
        )



    def _generate_docs_sync(
        self,
        *,
        analysis_json: str,
        source_files: dict[str, str],
        project_name: str | None = None,
        git_metadata_json: str | None = None,
        folder_tree: str | None = None,
        extra_instructions: str | None = None,
    ) -> Dict[str, Any]:
        user_prompt = build_documentation_user_prompt(
            analysis_json=analysis_json,
            source_files=source_files,
            project_name=project_name,
            git_metadata_json=git_metadata_json,
            folder_tree=folder_tree,
            extra_instructions=extra_instructions,
        )
        return self._generate_json(system_prompt=DOCS_SYSTEM_PROMPT, user_prompt=user_prompt)

    @async_retry(exceptions=(LLMError, TimeoutError, ConnectionError))
    async def generate_documentation_payload(
        self,
        *,
        analysis_json: str,
        source_files: dict[str, str],
        project_name: str | None = None,
        git_metadata_json: str | None = None,
        folder_tree: str | None = None,
        extra_instructions: str | None = None,
    ) -> Dict[str, Any]:
        logger.info(
            "Calling Vertex AI for documentation model=%s files=%s",
            self.settings.vertex_model,
            len(source_files),
        )
        return await asyncio.to_thread(
            self._generate_docs_sync,
            analysis_json=analysis_json,
            source_files=source_files,
            project_name=project_name,
            git_metadata_json=git_metadata_json,
            folder_tree=folder_tree,
            extra_instructions=extra_instructions,
        )


# Backward-compatible alias for existing imports/tests
OpenAIService = VertexAIService
