/**
 * Documentation generation API.
 * Flow: uploadRepository(files) → generateDocumentation({ job_id }) → downloadDocumentation(job_id)
 * History: listDocsJobs() → GET /documentation/jobs
 */

import { apiGetBlob, apiGetJson, apiPostForm, apiPostJson } from '@/lib/api/client';
import type {
  DocsJobListResponse,
  GenerateDocumentationRequest,
  GenerateDocumentationResponse,
  UploadRepositoryResponse,
} from '@/lib/types/docs';

/** POST /upload-repository — field name "files" */
export function uploadRepository(
  files: File[],
  signal?: AbortSignal,
): Promise<UploadRepositoryResponse> {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f);
  }
  return apiPostForm<UploadRepositoryResponse>('/upload-repository', formData, signal);
}

/** POST /generate-documentation — Vertex AI on server */
export function generateDocumentation(
  body: GenerateDocumentationRequest,
  signal?: AbortSignal,
): Promise<GenerateDocumentationResponse> {
  return apiPostJson<GenerateDocumentationResponse>(
    '/generate-documentation',
    body,
    signal,
  );
}

/** GET /download?job_id= */
export function downloadDocumentation(
  jobId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const params = new URLSearchParams({ job_id: jobId });
  return apiGetBlob(`/download?${params.toString()}`, signal);
}

/** GET /documentation/jobs — list documentation jobs (in-memory) */
export function listDocsJobs(signal?: AbortSignal): Promise<DocsJobListResponse> {
  return apiGetJson<DocsJobListResponse>('/documentation/jobs', signal);
}
