/**
 * Shared API types aligned with the FastAPI backend.
 *
 * Rule for this project (Option A): frontend types mirror backend response models.
 * Do not invent extra fields that the API does not return.
 */

/** Matches app.models.schemas.HealthResponse */
export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  environment: string;
}

/**
 * Matches the JSON body produced by app.core.exceptions register_exception_handlers.
 * Example:
 * {
 *   "error": {
 *     "code": "job_not_found",
 *     "message": "Job '...' not found",
 *     "details": { "job_id": "..." }
 *   }
 * }
 */
export interface BackendErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
