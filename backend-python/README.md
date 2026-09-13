# AI Unit Test Generator (FastAPI)

Production-oriented backend that:

1. Accepts **Python source**, **multiple files**, or a **repository ZIP**
2. Parses code with **AST**
3. Optionally reads git metadata via **GitPython**
4. Sends analysis + source to **Google Vertex AI (Gemini)**
5. Generates **pytest** suites with mocks, fixtures, boundary/negative/exception/parameterized cases
6. Returns coverage estimates, missing edge cases, and recommendations
7. Packages artifacts under `generated/<job_id>/tests/`

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/upload-code` | Upload `.py` files or a single `.zip` |
| `POST` | `/generate-tests` | Analyze + generate tests for a job |
| `GET` | `/download-tests?job_id=` | Download ZIP of generated tests/report |
| `GET` | `/jobs/{job_id}` | Job status |
| `GET` | `/health` | Health check |
| `POST` | `/prd/upload` | Upload PRD (PDF/DOCX/TXT/MD) |
| `POST` | `/prd/analyze` | Extract text + generate Jira backlog via Vertex AI |
| `GET` | `/prd/jobs` | List PRD jobs |
| `GET` | `/prd/jobs/{job_id}` | PRD job status + backlog |
| `GET` | `/prd/download?job_id=` | Download backlog JSON |
| `POST` | `/upload-repository` | Upload repo/files for documentation |
| `POST` | `/generate-documentation` | Generate docs via Vertex AI |
| `GET` | `/download?job_id=` | Download documentation ZIP |
| `GET` | `/documentation/jobs/{job_id}` | Documentation job status |
| `GET` | `/docs` | Swagger UI |

## Project structure

```text
app/
  main.py
  core/                 # config, logging, exceptions, retry
  api/routes/           # health + upload/generate/download
  models/schemas.py
  services/
    ast_analyzer.py     # AST function/class/API/DB/HTTP detection
    archive_service.py  # ZIP + GitPython + packaging
    vertex_ai_service.py  # Vertex AI Gemini client + retry
    test_generator_service.py
  prompts/test_generation.py
  storage/              # in-memory job store
sample_code/            # demo modules (users/auth/orders)
uploads/
generated/
```

## Setup

```bash
cd /Users/pankajmandal/Desktop/DB/backend-python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# set VERTEX_PROJECT_ID / VERTEX_LOCATION / VERTEX_MODEL in .env
# auth: gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
```

## Run

```bash
python main.py
# or
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

## Example flow

```bash
# 1) Upload sample modules
curl -X POST http://localhost:8080/upload-code \
  -F "files=@sample_code/users.py" \
  -F "files=@sample_code/auth.py" \
  -F "files=@sample_code/orders.py"

# 2) Generate tests (use job_id from step 1)
curl -X POST http://localhost:8080/generate-tests \
  -H "Content-Type: application/json" \
  -d '{"job_id":"YOUR_JOB_ID","test_style":"unit"}'

# 3) Download
curl -L "http://localhost:8080/download-tests?job_id=YOUR_JOB_ID" -o tests_bundle.zip
```

### ZIP repository upload

```bash
cd sample_code && zip -r ../sample_repo.zip . && cd ..
curl -X POST http://localhost:8080/upload-code -F "files=@sample_repo.zip"
```

## Output layout (per job)

```text
generated/<job_id>/
  tests/
    __init__.py
    test_users.py
    test_auth.py
    test_orders.py
  analysis.json
  report.json
  tests_bundle.zip
```

## Notes

- AST analysis detects functions, classes, FastAPI/Flask-style endpoints, raised exceptions, DB patterns, and external HTTP client usage.
- Vertex AI calls are retried with exponential backoff.
- Uploads are validated for type/size and ZIP slip-safe extraction.

## PRD → Jira work items (new feature)

Additive feature: existing unit-test APIs are unchanged.

1. Upload a PRD (`.pdf`, `.docx`, `.txt`, `.md`)
2. Extract text
3. Send to Vertex AI (Gemini) with a PM/BA prompt
4. Parse structured JSON epics/stories
5. Store and return via REST

### Example

```bash
# 1) Upload PRD
curl -X POST http://localhost:8080/prd/upload \
  -F "file=@sample_prd.txt"

# 2) Analyze (use job_id from step 1)
curl -X POST http://localhost:8080/prd/analyze \
  -H "Content-Type: application/json" \
  -d '{"job_id":"YOUR_JOB_ID","project_name_hint":"My Product"}'

# 3) Status / backlog
curl http://localhost:8080/prd/jobs/YOUR_JOB_ID

# 4) Download JSON
curl -L "http://localhost:8080/prd/download?job_id=YOUR_JOB_ID" -o backlog.json
```

Output JSON shape:

```json
{
  "project_name": "",
  "epics": [
    {
      "title": "",
      "description": "",
      "stories": [
        {
          "title": "",
          "description": "",
          "story_points": 5,
          "priority": "High",
          "labels": [],
          "components": [],
          "dependencies": [],
          "acceptance_criteria": ["Given ...\nWhen ...\nThen ..."]
        }
      ]
    }
  ]
}
```

## Feature 3 — AI Software Documentation

Additive feature. Features 1 (unit tests) and 2 (PRD→Jira) are unchanged.

Generates from Python source / ZIP / git-aware repo:

- README, API/class/function/module docs
- Architecture summary, dependency graph, sequence flow
- Release notes, installation guide, usage guide, folder structure
- Per-function: purpose, parameters, return type, example, exceptions
- Artifacts: **Markdown**, **JSON**, **PDF-ready HTML**

### Example

```bash
# 1) Upload repository or files
curl -X POST http://localhost:8080/upload-repository \
  -F "files=@sample_code/users.py" \
  -F "files=@sample_code/auth.py" \
  -F "files=@sample_code/orders.py"

# 2) Generate documentation (use job_id from step 1)
curl -X POST http://localhost:8080/generate-documentation \
  -H "Content-Type: application/json" \
  -d '{"job_id":"YOUR_JOB_ID","project_name":"Sample App","include_html":true}'

# Optional: background mode
# -d '{"job_id":"YOUR_JOB_ID","background":true}'

# 3) Status
curl http://localhost:8080/documentation/jobs/YOUR_JOB_ID

# 4) Download ZIP (md + json + html)
curl -L "http://localhost:8080/download?job_id=YOUR_JOB_ID" -o documentation.zip
```

Uses AST + optional GitPython metadata + Vertex AI Gemini (not OpenAI).

