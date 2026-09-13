"""Backward-compatible re-export.

OpenAI has been replaced by Vertex AI Gemini.
Prefer: from app.services.vertex_ai_service import VertexAIService
"""

from app.services.vertex_ai_service import VertexAIService as OpenAIService
from app.services.vertex_ai_service import VertexAIService, extract_json_object

__all__ = ["VertexAIService", "OpenAIService", "extract_json_object"]
