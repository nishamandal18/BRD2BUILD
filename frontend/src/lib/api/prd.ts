/**
 * PRD / BRD API module.
 */

import { apiGetBlob, apiGetJson, apiPostForm, apiPostJson } from '@/lib/api/client';
import type {
  AnalyzePrdRequest,
  AnalyzePrdResponse,
  PrdJobListResponse,
  PrdUploadResponse,
} from '@/lib/types/prd';

export function uploadPrd(
  file: File,
  signal?: AbortSignal,
): Promise<PrdUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return apiPostForm<PrdUploadResponse>('/prd/upload', formData, signal);
}

export function analyzePrd(
  body: AnalyzePrdRequest,
  signal?: AbortSignal,
): Promise<AnalyzePrdResponse> {
  return apiPostJson<AnalyzePrdResponse>('/prd/analyze', body, signal);
}

export async function downloadPrdBacklog(
  jobId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const params = new URLSearchParams({ job_id: jobId });
  return apiGetBlob(`/prd/download?${params.toString()}`, signal);
}

/** GET /prd/jobs */
export function listPrdJobs(signal?: AbortSignal): Promise<PrdJobListResponse> {
  return apiGetJson<PrdJobListResponse>('/prd/jobs', signal);
}
