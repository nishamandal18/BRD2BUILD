/**
 * Health check API module.
 *
 * Flow:
 *   getHealth()
 *     → apiGetJson('/health')
 *     → GET http://localhost:8080/health
 *     → FastAPI health router
 *     → HealthResponse JSON
 *
 * Vertex AI is not involved.
 */

import { apiGetJson } from '@/lib/api/client';
import type { HealthResponse } from '@/lib/types/api';

/** Call GET /health on the backend. */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGetJson<HealthResponse>('/health', signal);
}
