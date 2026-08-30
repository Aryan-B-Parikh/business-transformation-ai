# Agentic Coding Task Backlog
## Business Transformation AI (AI Solution Builder)

Purpose: this backlog is written so each task can be handed to a coding agent (e.g. Claude Code) as a self-contained unit of work — with explicit scope, inputs, and a "definition of done" the agent can verify itself (tests, build passing, etc.). Reference `02_TECHNICAL_ARCHITECTURE.md`, `03_DATA_MODEL.md`, and `04_API_SPEC.md` for schemas/contracts each task must follow.

**How to use this file with an agent:** paste one task block as the prompt, point the agent at the referenced docs in the repo, and let it work task-by-task rather than handing over the whole backlog at once — this keeps diffs reviewable and avoids scope drift.

---

## Epic 0 — Foundation

### TASK-001: Scaffold monorepo
- **Scope**: Initialize repo structure (`/apps/web`, `/apps/api`, `/apps/ai-orchestrator`, `/packages/shared`), package manager, linting, CI pipeline skeleton (lint + test on PR).
- **DoD**: `npm run build` succeeds in all apps; CI workflow runs on a dummy PR and passes.

### TASK-002: Postgres schema + migrations
- **Scope**: Implement all tables from `03_DATA_MODEL.md` using a migration tool (e.g. Prisma/Knex/Alembic). Add row-level security policies keyed on `org_id`.
- **DoD**: Migrations run clean on a fresh DB; a test proves a query without tenant context returns zero rows for a non-empty table.

### TASK-003: Auth service (OAuth2/OIDC + SSO)
- **Scope**: Implement `/auth/login`, `/auth/sso/callback`, JWT issuance with `org_id`/`role` claims.
- **DoD**: Integration test logs in a seeded user and receives a valid JWT; expired/invalid tokens are rejected with 401.

### TASK-004: RBAC middleware
- **Scope**: Middleware enforcing roles (org_admin, workspace_admin, contributor, reviewer, viewer) per `04_API_SPEC.md` endpoints.
- **DoD**: Test matrix covering each role × each protected endpoint (allow/deny) passes.

### TASK-005: Org/Workspace/Project CRUD API
- **Scope**: Implement endpoints under "Workspaces & Projects" in `04_API_SPEC.md`.
- **DoD**: All endpoints covered by integration tests; OpenAPI spec generated and matches `04_API_SPEC.md`.

---

## Epic 1 — Document Ingestion & Context

### TASK-006: File upload + storage
- **Scope**: `POST /projects/:id/documents` multipart upload to object storage; `documents` row created with `parsed_status: pending`.
- **DoD**: Upload of a sample PDF/DOCX/PPTX succeeds and is retrievable via signed URL.

### TASK-007: Document parsing pipeline
- **Scope**: Background worker: extract text from PDF/DOCX/PPTX, chunk it, generate embeddings, write to `document_chunks`. Update `parsed_status`.
- **DoD**: Given a sample SOP PDF, worker produces >0 chunks with non-null embeddings within 60s; `parsed_status` becomes `parsed`.

### TASK-008: RAG retrieval service
- **Scope**: Given a project_id + query, return top-k relevant `document_chunks` (vector similarity, tenant-scoped).
- **DoD**: Unit test with seeded chunks returns expected top-k ordering; cross-tenant leakage test proves isolation.

---

## Epic 2 — AI Discovery Core

### TASK-009: Conversation service
- **Scope**: Implement `conversations` + `conversation_messages` endpoints; message send triggers AI Orchestrator call and stores the AI reply.
- **DoD**: End-to-end test: create conversation → send message → AI reply persisted and returned.

### TASK-010: Discovery agent (AI Orchestrator)
- **Scope**: Implement `POST /ai/v1/discovery/ask` — takes conversation history + RAG context, returns next discovery question or a discovery summary when sufficient info is gathered.
- **DoD**: Given a scripted conversation fixture, agent asks a clarifying question when info is missing and produces a structured summary when it isn't.

### TASK-011: Business Analysis Engine (v1)
- **Scope**: `POST /ai/v1/business-analysis/generate` → produces `artifacts` of type `business_analysis` (gap analysis, stakeholder analysis, current/future state).
- **DoD**: Given a fixture conversation + document, generates an artifact matching the `content` schema; artifact stored with `status: draft`.

### TASK-012: AI Business Consultant (v1)
- **Scope**: `POST /ai/v1/consultant/validate-idea` — feasibility check + best-practice recommendations.
- **DoD**: Unit tests over 3+ fixture scenarios (vague idea → clarifying questions; solid idea → recommendations).

### TASK-013: Web UI — Chat & Discovery flow
- **Scope**: React chat UI for conversations; document upload widget; discovery summary view.
- **DoD**: Manual + Playwright test: user uploads a doc, chats, sees a discovery summary artifact rendered.

---

## Epic 3 — Solution Design Engines

### TASK-014: Solution Architecture Builder agent
- **Scope**: `POST /ai/v1/architecture/generate` → HLD/LLD artifact incl. `diagram_spec`.
- **DoD**: Given fixture input, returns valid `content` schema; diagram_spec renders without error in TASK-018.

### TASK-015: Process Intelligence Designer agent
- **Scope**: `POST /ai/v1/process/generate-workflow` → BPMN/workflow artifact.
- **DoD**: Output validates against a BPMN JSON schema; renders via TASK-018.

### TASK-016: Database & Integration Designer agent
- **Scope**: `POST /ai/v1/data-model/generate` → ER diagram + REST API spec artifact.
- **DoD**: Generated schema is valid SQL DDL (parses without error); API spec is valid OpenAPI.

### TASK-017: AI UX Designer agent
- **Scope**: `POST /ai/v1/ux/generate-wireframes` → wireframe artifact (screen list + layout spec).
- **DoD**: Output renders as low-fidelity wireframe images via TASK-018.

### TASK-018: Diagram render service
- **Scope**: Render BPMN/ER/architecture/wireframe `diagram_spec` JSON to SVG/PNG (server-side).
- **DoD**: Given each diagram type's fixture spec, produces a valid image file; visually spot-checked.

### TASK-019: Web UI — Artifact viewer/editor
- **Scope**: Generic artifact viewer that renders any artifact type (text sections + diagram), supports manual edit + "Regenerate" button.
- **DoD**: User can view an architecture artifact, edit a text field, save, and see version increment.

---

## Epic 4 — Planning & Dashboards

### TASK-020: Transformation Planner agent
- **Scope**: `POST /ai/v1/planning/generate-roadmap` → roadmap artifact + `roadmap_items` rows.
- **DoD**: Roadmap items have valid phase/date/dependency data; no circular dependencies (validated).

### TASK-021: AI Planning Engine (estimation)
- **Scope**: `POST /ai/v1/planning/estimate` → `effort_estimates` rows + risk levels.
- **DoD**: Given fixture scope, produces non-zero estimates with risk classification for each item.

### TASK-022: Dashboard API + UI
- **Scope**: `GET /projects/:id/dashboard` (+ history), computing maturity/readiness/health scores from artifacts + estimates; web dashboard UI with charts.
- **DoD**: Dashboard renders scores for a seeded project; history endpoint returns time series.

---

## Epic 5 — Collaboration, Export, Admin

### TASK-023: Comments & approvals
- **Scope**: `artifact_comments`, `artifact_approvals` endpoints + UI.
- **DoD**: Two seeded users can comment/approve on the same artifact; audit log entry created for approval.

### TASK-024: Version history
- **Scope**: `GET /artifacts/:id/versions`; every regenerate/edit creates a new version linked via `parent_artifact_id`.
- **DoD**: Regenerating an artifact 3x produces a 3-version chain retrievable in order.

### TASK-025: Export service (PDF/DOCX/XLSX/PPTX)
- **Scope**: `POST /artifacts/:id/export` — render artifact content + diagrams into the requested format.
- **DoD**: Each format produces a file that opens without corruption and contains the artifact's key sections.

### TASK-026: Notifications & activity log
- **Scope**: Event-driven notifications on comment/approval/mention; activity feed per project.
- **DoD**: Commenting triggers a notification row for relevant users; feed reflects the event within 5s.

### TASK-027: Enterprise API integration framework
- **Scope**: Outbound webhook config per workspace (artifact created/approved events); inbound API key auth for external systems to pull artifacts.
- **DoD**: Configuring a webhook URL and approving an artifact triggers a POST to that URL with the artifact payload.

### TASK-028: Admin dashboard (users/orgs/AI models/audit/usage)
- **Scope**: Implement all `/admin/*` endpoints + admin web UI.
- **DoD**: Admin can view audit logs filtered by actor/date, toggle an AI model config, and see usage metrics for the org.

---

## Epic 6 — Mobile & i18n

### TASK-029: Mobile app shell (Android/iOS)
- **Scope**: Auth, workspace/project list, chat/discovery flow (parity with TASK-013).
- **DoD**: App builds for both platforms; discovery flow works end-to-end against the same API.

### TASK-030: i18n framework
- **Scope**: String externalization (web + mobile), language switcher, AI responses requested in user's selected language.
- **DoD**: Switching language changes UI strings and a test conversation returns AI replies in the selected language.

---

## Epic 7 — Hardening & Launch

### TASK-031: Security audit fixes
- **Scope**: Address findings from a pen-test/RLS audit pass (to be scheduled once Epics 0–4 are functionally complete).
- **DoD**: All critical/high findings resolved with regression tests added.

### TASK-032: Load testing & performance tuning
- **Scope**: Load test AI generation endpoints and diagram rendering to targets in `02_TECHNICAL_ARCHITECTURE.md` §6.
- **DoD**: p95 latency targets met at target concurrent-tenant load in a staging run.

### TASK-033: Pilot UAT feedback fixes
- **Scope**: Backlog of fixes from pilot customer feedback (populated during Phase 5 of the roadmap).
- **DoD**: Each fix ships with a regression test tied to the reported issue.

---

## Notes for the Coding Agent
- Every artifact-producing endpoint (Epics 2–4) must return data conforming to `03_DATA_MODEL.md`'s `artifacts.content` shape — write a JSON schema per artifact type and validate against it in tests before marking a task done.
- Never mark an AI-generated artifact `status: approved` automatically — that transition is a human action only (see PRD constraint on advisory-only AI output).
- Tenant isolation (`org_id` scoping + RLS) must be verified by an explicit cross-tenant test in every task that touches the database — treat a missing isolation test as an incomplete task, not an optional extra.
