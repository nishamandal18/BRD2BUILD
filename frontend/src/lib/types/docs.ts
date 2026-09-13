/** Documentation API types — mirror app.models.docs_schemas */

export type DocsJobStatus =
  | 'uploaded'
  | 'analyzing'
  | 'generating'
  | 'completed'
  | 'failed';

export interface FunctionDoc {
  name: string;
  qualified_name?: string;
  purpose?: string;
  parameters?: string[];
  return_type?: string;
  example?: string;
  possible_exceptions?: string[];
  module?: string;
}

export interface ClassDoc {
  name: string;
  purpose?: string;
  methods?: FunctionDoc[];
  module?: string;
}

export interface ModuleDoc {
  path: string;
  name: string;
  purpose?: string;
  classes?: string[];
  functions?: string[];
}

export interface DocumentationBundle {
  project_name: string;
  readme_md: string;
  api_documentation_md: string;
  class_documentation_md: string;
  function_documentation_md: string;
  module_documentation_md: string;
  architecture_summary_md: string;
  dependency_graph_md: string;
  sequence_flow_md: string;
  release_notes_md: string;
  installation_guide_md: string;
  usage_guide_md: string;
  folder_structure_md: string;
  functions: FunctionDoc[];
  classes: ClassDoc[];
  modules: ModuleDoc[];
  metadata: Record<string, unknown>;
}

export interface UploadRepositoryResponse {
  job_id: string;
  status: DocsJobStatus;
  file_count: number;
  files: string[];
  message: string;
}

export interface GenerateDocumentationRequest {
  job_id: string;
  project_name?: string | null;
  include_html?: boolean;
  background?: boolean;
  extra_instructions?: string | null;
}

export interface GenerateDocumentationResponse {
  job_id: string;
  status: DocsJobStatus;
  project_name: string | null;
  download_url: string;
  message: string;
  documentation: DocumentationBundle | null;
}

export interface DocsJobStatusResponse {
  job_id: string;
  status: DocsJobStatus;
  file_count: number;
  project_name: string | null;
  error: string | null;
  download_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches backend DocsJobListItem */
export interface DocsJobListItem {
  job_id: string;
  status: DocsJobStatus;
  file_count: number;
  original_filenames: string[];
  project_name: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches backend DocsJobListResponse */
export interface DocsJobListResponse {
  jobs: DocsJobListItem[];
  total: number;
}
