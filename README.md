# Business Transformation AI — AI Solution Builder

Monorepo for the Business Transformation AI platform (PRD: `01_PRD.md`, Architecture: `02_TECHNICAL_ARCHITECTURE.md`).

## Structure

```
apps/
  web/              # React + TypeScript frontend (02 §7)
  api/              # Core API service — workspaces/projects/RBAC (02 §2.1)
  ai-orchestrator/  # AI Orchestration — agents, RAG, LLM wrapper (02 §2.2, §4)
packages/
  shared/           # Shared types, constants, helpers (Data Model + API Spec)
.github/workflows/
  ci.yml            # Lint + Build + Test on PR (TASK-001 DoD)
```

## Prerequisites

- Node.js >=18, npm >=9

## Quick start

```bash
npm install        # install all workspaces
npm run build      # build all apps (must succeed per TASK-001 DoD)
npm run lint       # eslint across repo
npm run test       # tests across workspaces
```

Build a single workspace:

```bash
npm run build --workspace=@bta/api
npm run build --workspace=@bta/ai-orchestrator
npm run build --workspace=@bta/web
npm run build --workspace=@bta/shared
```

## Tech stack (starting point per 02 §7)

- Backend: Node.js / TypeScript (FastAPI alternative TBD)
- Frontend: React + TypeScript; Mobile: React Native (deferred)
- AI: Claude/GPT via API, pgvector / managed vector DB
- Diagramming: mermaid / BPMN.js / custom SVG
- Infra: Kubernetes, Terraform, GitHub Actions

## Contracts

- Data Model: `03_DATA_MODEL.md` — all tables include `org_id` except `organizations`; RLS enforced.
- API Spec: `04_API_SPEC.md` — base `/api/v1`, JWT with `org_id` claim, never client-supplied.
- Backlog: `05_AGENT_TASK_BACKLOG.md` — execute task-by-task (TASK-001 done).

## Constraints (PRD §6)

- AI output is advisory only — requires human review (`draft → in_review → approved`).
- All artifacts editable, regenerable, version-controlled, collaborative, exportable.
- Multi-tenant isolation (`org_id` + RLS) mandatory; cross-tenant tests required per task.

## CI

`npm run build` must succeed in all apps. CI workflow (`.github/workflows/ci.yml`) runs lint + build + test on every PR.
