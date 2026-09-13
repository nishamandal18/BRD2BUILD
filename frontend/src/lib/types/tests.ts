/** Unit-test API types — mirror app.models.schemas */

export type JobStatus =
  | 'uploaded'
  | 'analyzing'
  | 'generating'
  | 'completed'
  | 'failed';

export interface CoverageEstimate {
  estimated_line_coverage_percent: number;
  estimated_branch_coverage_percent: number;
  covered_functions: string[];
  uncovered_functions: string[];
  notes: string[];
}

export interface GenerationReport {
  coverage: CoverageEstimate;
  missing_edge_cases: string[];
  testing_recommendations: string[];
  framework: string;
  generated_at: string;
}

export interface GeneratedTestFile {
  relative_path: string;
  content: string;
  source_modules: string[];
}

export interface UploadCodeResponse {
  job_id: string;
  status: JobStatus;
  file_count: number;
  files: string[];
  message: string;
}

export interface GenerateTestsRequest {
  job_id: string;
  include_integration_style?: boolean;
  test_style?: string;
}

export interface GenerateTestsResponse {
  job_id: string;
  status: JobStatus;
  test_files: GeneratedTestFile[];
  report: GenerationReport;
  download_url: string;
  message: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  file_count: number;
  test_file_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches backend JobListItem */
export interface JobListItem {
  job_id: string;
  status: JobStatus;
  file_count: number;
  test_file_count: number;
  original_filenames: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches backend JobListResponse */
export interface JobListResponse {
  jobs: JobListItem[];
  total: number;
}
