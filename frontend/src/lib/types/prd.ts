/**
 * PRD / BRD API types — mirror backend app.models.prd_schemas exactly (Option A).
 * Do not invent keys, assignees, or P0–P3 priorities on the client.
 */

/** Matches backend Priority enum */
export type PrdPriority = 'Critical' | 'High' | 'Medium' | 'Low';

/** Matches backend PrdJobStatus enum */
export type PrdJobStatus =
  | 'uploaded'
  | 'extracting'
  | 'analyzing'
  | 'completed'
  | 'failed';

/** Matches backend JiraStory */
export interface JiraStory {
  title: string;
  description: string;
  story_points: number;
  priority: PrdPriority;
  labels: string[];
  components: string[];
  dependencies: string[];
  acceptance_criteria: string[];
}

/** Matches backend JiraEpic */
export interface JiraEpic {
  title: string;
  description: string;
  stories: JiraStory[];
}

/** Matches backend JiraBacklog */
export interface JiraBacklog {
  project_name: string;
  epics: JiraEpic[];
}

/** Matches backend PrdUploadResponse */
export interface PrdUploadResponse {
  job_id: string;
  status: PrdJobStatus;
  filename: string;
  message: string;
}

/** Matches backend AnalyzePrdRequest */
export interface AnalyzePrdRequest {
  job_id: string;
  project_name_hint?: string | null;
  extra_instructions?: string | null;
}

/** Matches backend AnalyzePrdResponse */
export interface AnalyzePrdResponse {
  job_id: string;
  status: PrdJobStatus;
  project_name: string;
  epic_count: number;
  story_count: number;
  backlog: JiraBacklog;
  message: string;
}

/** Matches backend PrdJobStatusResponse */
export interface PrdJobStatusResponse {
  job_id: string;
  status: PrdJobStatus;
  original_filename: string;
  extracted_char_count: number;
  epic_count: number;
  story_count: number;
  backlog: JiraBacklog | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches backend PrdJobListItem */
export interface PrdJobListItem {
  job_id: string;
  status: PrdJobStatus;
  original_filename: string;
  project_name: string | null;
  epic_count: number;
  story_count: number;
  created_at: string;
  updated_at: string;
}

/** Matches backend PrdJobListResponse */
export interface PrdJobListResponse {
  jobs: PrdJobListItem[];
  total: number;
}
