# Canvas Platform

Monorepo with:
- `frontend`: Next.js canvas UI for AI workflow graphs.
- `backend`: FastAPI API for generation, editing, video, credits, and workflow data.
- `supabase`: SQL migrations for schema and policies.

## Local development

1. Configure root `.env` and service-specific envs as needed.
2. Start with Docker:
   - `docker compose up --build`
3. Or run manually:
   - Frontend: `cd frontend && npm install && npm run dev`
   - Backend: `cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && uvicorn main:app --reload`

## Production check

Run:
- `cd frontend && npm run build`
- `cd backend && python -m py_compile main.py auth.py credit_manager.py progress_tracker.py routers/*.py`

