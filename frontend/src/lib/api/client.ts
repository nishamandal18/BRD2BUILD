/**
 * Shared HTTP client for talking to the FastAPI backend.
 *
 * Why this file exists:
 * - One place to read VITE_API_BASE_URL
 * - One place to parse backend errors ({ error: { code, message, details } })
 * - Reusable helpers for JSON, multipart uploads, and binary downloads
 *
 * How data flows:
 *   Page/hook → feature API module (e.g. health.ts) → apiRequest() here → fetch → FastAPI
 */

import type { BackendErrorBody } from '@/lib/types/api';

/** Thrown when the backend returns a non-2xx response or the network fails. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Base URL of FastAPI.
 * - Prefer VITE_API_BASE_URL from .env
 * - Fallback to local backend default (port 8080) so dev still works if env is missing
 * - Strip trailing slash so path joining is predictable
 */
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : 'http://localhost:8080';
  return base.replace(/\/+$/, '');
}

/** Build absolute URL: base + path (path must start with /). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalized}`;
}

type ApiRequestOptions = {
  method?: string;
  /** JSON object, FormData, Blob, string, etc. */
  body?: BodyInit | null;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /**
   * When true, we do NOT set Content-Type.
   * The browser must set multipart boundaries for FormData automatically.
   */
  isFormData?: boolean;
};

/**
 * Core request helper.
 * - Sends fetch to FastAPI
 * - Parses JSON success bodies
 * - Turns FastAPI error JSON into ApiError
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body = null,
    headers: initHeaders,
    signal,
    isFormData = false,
  } = options;

  const headers = new Headers(initHeaders);

  // JSON bodies need Content-Type. FormData must NOT set it manually.
  if (body != null && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body,
      signal,
    });
  } catch (err) {
    // Network down, CORS blocked, wrong host, backend not running, etc.
    const message =
      err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError(
      0,
      'network_error',
      `Cannot reach API at ${getApiBaseUrl()}. Is the backend running? (${message})`,
    );
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 No Content (rare here, but safe)
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  // Fallback: return text if server did not send JSON
  return (await response.text()) as T;
}

/** GET JSON from FastAPI. */
export function apiGetJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', signal });
}

/** POST a JSON body. FastAPI will validate it with a Pydantic model. */
export function apiPostJson<T>(
  path: string,
  data: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: JSON.stringify(data),
    signal,
  });
}

/**
 * POST multipart/form-data (file uploads).
 * Used later by: /prd/upload, /upload-code, /upload-repository
 */
export function apiPostForm<T>(
  path: string,
  formData: FormData,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: formData,
    isFormData: true,
    signal,
  });
}

/**
 * GET a binary file (ZIP/JSON download endpoints).
 * Used later by: /download-tests, /prd/download, /download
 */
export async function apiGetBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: 'GET', signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError(
      0,
      'network_error',
      `Cannot reach API at ${getApiBaseUrl()}. Is the backend running? (${message})`,
    );
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.blob();
}

/** Parse FastAPI error JSON (or fall back to status text). */
async function toApiError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let message = response.statusText || `Request failed with status ${response.status}`;
  let details: Record<string, unknown> = {};

  try {
    const data = (await response.json()) as BackendErrorBody | Record<string, unknown>;
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      data.error &&
      typeof data.error === 'object'
    ) {
      const err = (data as BackendErrorBody).error;
      code = err.code || code;
      message = err.message || message;
      details = (err.details as Record<string, unknown>) || {};
    }
  } catch {
    // Body was not JSON; keep statusText message
  }

  return new ApiError(response.status, code, message, details);
}
