/**
 * Unit test generation API.
 * Flow: uploadCode(files) → generateTests({ job_id }) → optional downloadTests(job_id)
 * History: listUnitTestJobs() → GET /jobs
 */

import { apiGetBlob, apiGetJson, apiPostForm, apiPostJson } from '@/lib/api/client';
import type {
  GenerateTestsRequest,
  GenerateTestsResponse,
  JobListResponse,
  UploadCodeResponse,
} from '@/lib/types/tests';

/** POST /upload-code — field name "files" (repeatable) */
export function uploadCode(
  files: File[],
  signal?: AbortSignal,
): Promise<UploadCodeResponse> {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f);
  }
  return apiPostForm<UploadCodeResponse>('/upload-code', formData, signal);
}

/** POST /generate-tests — Vertex AI on server */
export function generateTests(
  body: GenerateTestsRequest,
  signal?: AbortSignal,
): Promise<GenerateTestsResponse> {
  return apiPostJson<GenerateTestsResponse>('/generate-tests', body, signal);
}

/** GET /download-tests?job_id= */
export function downloadTests(jobId: string, signal?: AbortSignal): Promise<Blob> {
  const params = new URLSearchParams({ job_id: jobId });
  return apiGetBlob(`/download-tests?${params.toString()}`, signal);
}

/** GET /jobs — list unit-test jobs (in-memory) */
export function listUnitTestJobs(signal?: AbortSignal): Promise<JobListResponse> {
  return apiGetJson<JobListResponse>('/jobs', signal);
}
