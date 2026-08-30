# Business Transformation AI — Master Production Completion Plan

**Repository:** `Aryan-B-Parikh/business-transformation-ai`  
**Objective:** Bring Business Transformation AI from the current implementation state to a fully integrated, secure, testable, PRD-compliant production system.

> **Definition of Done**
>
> A requirement is NOT considered complete because a file, interface, route, schema, mock, placeholder, or package exists.
>
> Every requirement must satisfy:
>
> 1. Implemented
> 2. Integrated into the real production execution path
> 3. Persisted where persistence is required
> 4. Authorized
> 5. Tenant-isolated
> 6. Validated
> 7. Tested
> 8. Observable
> 9. Failure-safe
> 10. Documented
>
> The final system must pass the complete Golden Path against real infrastructure.

---

# 1. Non-Negotiable Architectural Invariants

These invariants apply to the entire repository.

## 1.1 Production Persistence

Production MUST use:

```text
STORAGE_BACKEND=postgres
DATABASE_URL=<valid production PostgreSQL URL>
```

Production MUST fail startup if:
- `STORAGE_BACKEND != postgres`
- `DATABASE_URL` is missing
- PostgreSQL cannot be reached
- Prisma schema/migrations are invalid
- Production JWT configuration is invalid
- Required secrets are missing
- Required storage configuration is missing

Memory repositories are permitted ONLY for isolated unit tests.

There MUST NOT be:
- Production → memory fallback
- Production → Map persistence
- Production → mock repository
- Production → fake database

---

# 2. Domain Aggregate Repository Architecture

Repositories MUST represent domain aggregates rather than 1:1 database tables.

Required aggregate boundaries:
1. `ProjectAggregateRepository`
2. `ArtifactAggregateRepository`
3. `DocumentAggregateRepository`
4. `TransformationAggregateRepository`
5. `CollaborationAggregateRepository`
6. `WebhookAggregateRepository`
7. `GovernanceAggregateRepository`

Additional repositories may be introduced where justified by domain ownership.

### Required Implementation Structure
```text
apps/api/src/repositories/
├── interfaces/
├── postgres/
├── memory/
└── index.ts
```

Every production domain service MUST depend on interfaces.

Production services MUST NOT directly use:
- Prisma model CRUD
- In-memory `Map`
- Global mutable state
- Test repository
- Mock repository

unless explicitly permitted by the architecture.

### Completion Criteria
- [ ] All 7 required aggregate interfaces exist
- [ ] PostgreSQL implementations exist for all 7
- [ ] Memory implementations exist only for tests
- [ ] Provider exposes every required aggregate
- [ ] All production services use repository interfaces
- [ ] No production service bypasses repository layer
- [ ] Repository integration tests pass
- [ ] Repository transaction tests pass

---

# 3. PostgreSQL and RLS

### 3.1 Tenant Context
Every tenant-scoped transaction MUST execute:
```sql
SELECT set_config('app.current_org_id', $1, true);
```
The final argument MUST be transaction-local (`is_local = true`).

Tenant context MUST NEVER be connection-global.

### 3.2 RLS Requirements
Every tenant-scoped table MUST have:
- RLS enabled
- Tenant isolation policy
- Appropriate SELECT policy
- Appropriate INSERT policy
- Appropriate UPDATE policy
- Appropriate DELETE policy

The production database role MUST NOT be a superuser and MUST NOT have privileges that bypass RLS.

### 3.3 Application Rules
`org_id` MUST NEVER be trusted from a client request for authorization.

Canonical flow:
```text
JWT
 ↓
Authenticated user
 ↓
Authorized organization membership
 ↓
Server-derived org_id
 ↓
Transaction-local RLS context
 ↓
Repository operation
```

### 3.4 RLS Security Tests
Implement automated attacks covering:
- [ ] Cross-tenant SELECT
- [ ] Cross-tenant INSERT
- [ ] Cross-tenant UPDATE
- [ ] Cross-tenant DELETE
- [ ] Missing tenant context
- [ ] Invalid tenant context
- [ ] Connection pool reuse
- [ ] Concurrent requests from different tenants
- [ ] Transaction rollback
- [ ] Nested transactions
- [ ] Direct repository access
- [ ] Attempted client-controlled `org_id`

All must fail safely.

---

# 4. Prisma Migration Source of Truth

Prisma MUST remain the sole migration authority. Do NOT introduce a duplicate custom migration directory.

Required:
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`

Verify:
- [ ] All required tables exist
- [ ] Foreign keys
- [ ] Unique constraints
- [ ] Check constraints
- [ ] Indexes
- [ ] Vector extension (`pgvector`) where required
- [ ] RLS policies
- [ ] Audit tables
- [ ] Webhook/outbox tables
- [ ] Transformation journey tables
- [ ] Revision/version tables

Migration verification:
```text
Fresh database
 ↓
prisma migrate deploy
 ↓
Application startup
 ↓
Integration tests
```

---

# 5. Authentication and JWT

### 5.1 JWT Claims
Use one canonical claim format:
```json
{
  "sub": "user-id",
  "org_id": "organization-id",
  "role": "role",
  "iss": "canonical issuer",
  "aud": "canonical audience",
  "iat": 0,
  "exp": 0,
  "jti": "token-id"
}
```
Do not maintain multiple incompatible claim conventions.

### 5.2 Validation
Verify:
- Signature
- Algorithm allowlist (`HS256`, `RS256`)
- Issuer
- Audience
- Expiration
- Not-before
- Subject
- Organization
- Role
- Token ID

Reject:
- `none` algorithm
- Unsupported algorithm
- Expired tokens
- Malformed tokens
- Missing required claims
- Invalid issuer
- Invalid audience

### 5.3 Production Key Management
Implement:
- [ ] Production secret/key validation (fail-fast on default secrets or < 32 chars)
- [ ] Key IDs (`kid`)
- [ ] Key rotation
- [ ] Previous-key verification window
- [ ] JWKS or equivalent key discovery where appropriate
- [ ] Secret never logged
- [ ] Secret never committed
- [ ] Development credentials rejected in production

### 5.4 Token Lifecycle
- [ ] Access token expiry
- [ ] Refresh token strategy
- [ ] Refresh token rotation
- [ ] Revocation
- [ ] Replay protection
- [ ] Logout invalidation

---

# 6. RBAC and Authorization

Define organization roles: `owner`, `admin`, `member`  
Define project roles: `owner`, `contributor`, `reviewer`, `viewer`

Authorization MUST be checked at:
- Route
- Service
- Repository
- Artifact/document access

Sensitive operations:
- Organization administration
- Project creation / deletion
- Document access
- Artifact access
- Approvals
- AI configuration
- Exports
- Webhook configuration
- Audit access
- Governance configuration

Every permission denial must produce an auditable security event where appropriate.

---

# 7. Shared Contracts

Maintain `packages/shared/src/contracts/` consumed by:
- API
- Web
- Mobile
- AI

Required contracts:
- `auth`
- `organizations`
- `workspaces`
- `projects`
- `documents`
- `conversations`
- `discovery`
- `businessAnalysis`
- `architecture`
- `process`
- `ux`
- `dataModel`
- `roadmap`
- `estimation`
- `dashboard`
- `artifacts`
- `collaboration`
- `approvals`
- `notifications`
- `webhooks`
- `admin`
- `errors`
- `pagination`

All API boundaries MUST use versioned schemas (`contract_version: "v1"`). No independently duplicated DTOs.

---

# 8. Standard API Contract

Every API response must use a predictable structure:
```json
// Success
{
  "data": {},
  "meta": {}
}

// Error
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "request_id": "..."
  }
}
```

Implement:
- Pagination
- Sorting
- Filtering
- Request IDs
- Correlation IDs
- Idempotency keys
- API versioning
- Structured errors
- Validation errors
- Rate-limit responses

---

# 9. Object Storage

Implement production object storage adapter.
- [ ] S3-compatible provider
- [ ] Signed upload URLs
- [ ] Signed download URLs
- [ ] Content-type validation
- [ ] File-size limits
- [ ] Organization isolation
- [ ] Project isolation
- [ ] Encryption at rest & transit
- [ ] Retention policy
- [ ] Delete lifecycle
- [ ] Malware scanning where required

Database stores metadata, not large binary payloads.

---

# 10. Secure Document Pipeline

Supported documents: PDF, DOCX, PPTX, XLSX, TXT, MD.

Pipeline:
```text
Upload
 ↓
Validate
 ↓
Virus/security scan
 ↓
Sandbox
 ↓
Extract
 ↓
Normalize
 ↓
Chunk
 ↓
Embed
 ↓
Persist
 ↓
Index
```

Security:
- MIME validation
- Magic-byte validation
- File-size limit
- Extraction-size limit
- File-count limit
- Archive traversal protection
- Symlink protection
- Compression-bomb protection
- Parser timeout
- CPU limit
- Memory limit
- Network disabled
- No arbitrary code execution

---

# 11. Application Assessment Engine

Support: Source Code, OpenAPI, SQL DDL, Docker, Kubernetes, Terraform.

### Source Analysis
- Language, framework, dependencies, architecture, layering, API patterns, DB access, auth patterns, technical debt, obsolete dependencies, code smells.

### OpenAPI Analysis
- Endpoint catalog, HTTP methods, auth requirements, request/response models, dependencies, versioning issues, security risks.

### SQL DDL Analysis
- Table topology, foreign-key graph, indexes, missing indexes, migration risks, normalization indicators.

### Infrastructure Analysis
- Docker, Kubernetes, Terraform resource inventory, dependency graph, security risks, scalability risks, modernization opportunities.

### Security
Submitted code MUST NEVER execute. Implement sandbox, no network, CPU limit, memory limit, timeout, path traversal & symlink rejection.

---

# 12. Vector RAG

Pipeline:
```text
pgvector
 ↓
Chunk embeddings
 ↓
Metadata filtering
 ↓
Top-K retrieval
 ↓
Reranking
 ↓
Citation generation
```

Every retrieval MUST be filtered by `org_id`, `project_id`, and document permissions. No cross-tenant retrieval.

### Citation Contract
```json
{
  "documentId": "...",
  "chunkId": "...",
  "page": 1,
  "snippet": "...",
  "relevance": 0.92
}
```

### RAG Evaluation
- [ ] Recall@K
- [ ] Precision@K
- [ ] Citation correctness
- [ ] Grounded answer rate
- [ ] Unsupported claim rate
- [ ] Cross-tenant leakage
- [ ] Empty retrieval handling

---

# 13. AI Output Validation & Repair

All AI-generated structured output MUST pass Zod validation before persistence.

Pipeline:
```text
LLM
 ↓
JSON extraction
 ↓
Schema validation
 ↓
Repair attempt (up to 2x)
 ↓
Validation
 ↓
Persistence
```

Track: `model`, `prompt_version`, `schema_version`, `attempt`, `validation_result`, `latency`, `token_usage`, `cost`.

---

# 14. Persistent Transformation Journey

Required 12 stages:
`idea` -> `discovery` -> `business_analysis` -> `solution_design` -> `architecture` -> `process_design` -> `ux_design` -> `data_design` -> `planning` -> `review` -> `approved` -> `implementation`.

Persist: `current_stage`, `status`, `version`, `entered_at`, `completed_at`, `actor`.

Maintain stage history: `from_stage`, `to_stage`, `actor`, `reason`, `timestamp`, `revision`.

Rules:
- Invalid transitions rejected
- Role-based transitions
- Approval permissions
- Revision support
- Rollback support (traceable revision, not history deletion)
- Audit logging
- Optimistic concurrency
- Resume after restart

---

# 15. AI Transformation Engines

Implement real engines for: Business Analysis, Solution Blueprint, HLD, LLD, Architecture, BPMN/Process, UX, ER/Data Model, Roadmap, Effort Estimation, Risk Analysis, Modernization.

Each engine must provide: `input`, `output`, `schema`, `evidence`, `confidence`, `model`, `prompt_version`, `generation_timestamp`, `revision`.

---

# 16. Transactional Outbox

Domain mutation and event creation MUST occur in one database transaction:
```sql
BEGIN;
  -- mutate domain state
  -- insert outbox event
COMMIT;
```

Required: `outbox` table, event type, aggregate ID, organization ID, payload, idempotency key, attempt count, status, next attempt, last error, timestamps, dead-letter state, replay.

---

# 17. Async Workers

Implement durable workers for document parsing, embedding, AI generation, exports, webhook delivery, notifications, assessment.

Workers require: retries, exponential backoff, timeout, idempotency, dead-letter handling, concurrency limits, graceful shutdown, job observability.

---

# 18. Webhooks and SSRF

Webhook delivery MUST be asynchronous via transactional outbox worker.

Security pipeline:
```text
URL validation
 ↓
Scheme validation
 ↓
DNS resolution (A & AAAA)
 ↓
IP validation
 ↓
HTTP request
 ↓
Redirect validation
 ↓
DNS resolution again
 ↓
IP validation again
```

Block:
- `127.0.0.0/8`, `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `224.0.0.0/4`, `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped private IPv6, cloud metadata endpoints.
- DNS rebinding, redirect chains, public -> private redirects, non-HTTP schemes, response size limits, connection timeouts.

---

# 19. Webhook Security

Sign payloads using HMAC-SHA256. Headers:
- `X-BTA-Event`
- `X-BTA-Event-ID`
- `X-BTA-Timestamp`
- `X-BTA-Signature` (signature over timestamp + payload)

Implement replay protection, timestamp tolerance, secret rotation, retries, dead letter, delivery logs, manual replay.

---

# 20. Real Binary Exports

Dependencies: `pdfkit`, `docx`, `exceljs`, `pptxgenjs`.

- **PDF**: Title, metadata, executive summary, tables, architecture diagrams, roadmap, maturity, page numbers, headers/footers, citations.
- **DOCX**: Headings, tables, diagrams, metadata, page structure.
- **XLSX**: Sheets: `Roadmap`, `Cost Estimate`, `Maturity`, `Risks`.
- **PPTX**: 16:9 widescreen, executive summary, current/target state, architecture, roadmap, financial/effort summary, risks.
- **Validation**: Test using real parsers—not merely magic bytes. Verify valid binary structure, content, tables, slides, sheets, diagrams, and lack of corruption.

---

# 21. Artifact Versioning

Every generated artifact must record:
`artifact_id`, `project_id`, `organization_id`, `artifact_type`, `version`, `created_by`, `created_at`, `source_revision`, `formula_version`, `prompt_version`.

Deterministic metadata, immutable versions, revision history, authorization, audit events, reproducibility.

---

# 22. Mathematical Dashboard

Dimensions:
- Process (20%)
- Technology (20%)
- Data (20%)
- Automation (20%)
- Governance (20%)

Formula:
```text
Maturity = (Process × 0.20) + (Technology × 0.20) + (Data × 0.20) + (Automation × 0.20) + (Governance × 0.20)
```

Additional metrics: AI Readiness, Automation Opportunity, Project Health, Implementation Readiness, Risk.

Every score MUST record: `formula_version` (`v1.0`), dimension, weight, score, evidence, confidence, `calculated_at`.

Historical snapshots MUST remain reproducible.

---

# 23. Collaboration

Implement comments, mentions (`@user`), activity feeds, approvals, reviews, notifications.
Project-scoped, organization-scoped, permission-aware, tenant-isolated, auditable, pagination, unread state, notification preferences.

---

# 24. Approval Workflow

States: `draft` -> `submitted` -> `in_review` -> `approved` / `rejected` / `revision_required`.

Records: `actor`, `role`, `timestamp`, `revision`, `decision`, `reason`. Permission-controlled and immutable in audit history.

---

# 25. Enterprise Administration

Admin dashboard: organizations, users, projects, AI usage, tokens, cost, storage, active users, models, webhooks, audit, quotas.

AI governance: model allowlist, model routing, token budgets, cost limits, per-org quotas, provider configuration, prompt versions, model versions, evaluation results, retention policy.

---

# 26. Audit Logging

Audit events MUST be append-only.
Record: `organization`, `actor`, `action`, `resource`, `resource_id`, `before`, `after`, `request_id`, `timestamp`, IP.
Audit auth, authorization changes, project changes, document access, artifact generation, AI generation, approvals, exports, webhook changes, admin operations, security failures. Never silently editable/deletable.

---

# 27. Web Frontend

Remove all demo behavior: demo project, demo token, fake API response, hardcoded project, mock dashboard, placeholder artifact.

Implement real views with live API binding, loading states, empty states, error states, retry, permission states, auth expiry handling.

---

# 28. Mobile

Replace HTML/mock wrapper with real React Native / Expo implementation.
Real API, secure token storage, refresh handling, push notifications, permission handling, offline/degraded state, deep linking, error handling.

---

# 29. Observability

`request_id` and `correlation_id` across every request/job.
Metrics: latency, errors, status codes, DB timings, AI latency/tokens/cost, queue latency, export latency, webhook delivery.
Structured logs, metrics, tracing, health/readiness/liveness endpoints, alerting. Secrets never logged.

---

# 30. Rate Limiting

Limits for login, AI generation, document upload, exports, webhooks, admin endpoints. Per-IP, per-user, per-organization, per-resource. AI token/cost quotas.

---

# 31. Concurrency and Idempotency

Optimistic concurrency using `version`, `updated_at`, `revision`, `idempotency_key`. Test concurrent updates, duplicate requests, duplicate webhook events, duplicate exports, concurrent approvals, concurrent stage transitions.

---

# 32. Disaster Recovery

RPO < 1 hour, RTO < 4 hours. DB backups, backup verification, restore test, object storage recovery, migration recovery, disaster runbook, rollback procedure.

---

# 33. CI/CD Security Gate

Pipeline:
```text
Install
 ↓
Lint
 ↓
Typecheck
 ↓
Unit tests
 ↓
Integration tests
 ↓
Security tests
 ↓
Build
 ↓
Migration verification
 ↓
E2E
```

Checks: secret scanning, dependency audit, SAST, container scanning, lockfile verification, production config validation.

---

# 34. Performance SLOs

Targets:
- API p50 < 50ms, p95 < 200ms, p99 < 500ms
- Database query latency < 20ms
- AI streaming p50 < 1.5s
- Document processing < 30s for 10MB PDF
- Export generation < 5s for full bundle
- Webhook delivery latency < 2s

---

# 35. Golden Path E2E

The final acceptance test MUST use real infrastructure:
```text
Organization
 ↓
User
 ↓
Authentication
 ↓
Workspace
 ↓
Project
 ↓
Document Upload
 ↓
Object Storage
 ↓
Secure Parser
 ↓
Embedding
 ↓
Vector RAG
 ↓
Discovery
 ↓
Business Analysis
 ↓
Solution Design
 ↓
Architecture
 ↓
Process
 ↓
UX
 ↓
Data
 ↓
Roadmap
 ↓
Estimation
 ↓
Dashboard
 ↓
Human Review
 ↓
Approval
 ↓
Audit Event
 ↓
Artifact Version
 ↓
PDF
DOCX
XLSX
PPTX
 ↓
Authorized Download
```

---

# 36. Cross-Tenant Attack Suite

Verify Tenant A cannot access Tenant B's projects, documents, chunks, conversations, artifacts, comments, approvals, roadmap, dashboard, audit logs, notifications, AI configs, webhooks across API, repository, DB, RAG, exports, signed URLs, and webhooks.

---

# 37. Production Configuration Gate

Verify on startup: `DATABASE_URL`, `STORAGE_BACKEND`, `JWT_SECRET` (>= 32 chars, not dev default), `JWT_ISSUER`, `JWT_AUDIENCE`, object storage, AI provider, AI model, webhook config, encryption config.

---

# 38. Code Quality Gate

Search and eliminate production implementations containing: `new Map(`, `demo`, `mock`, `stub`, `fake`, `placeholder`, `TODO`, `NotImplemented`, `hardcoded token`, `fake export`. Exceptions strictly marked test-only and unreachable in production paths.

---

# 39. Final 10/10 Acceptance Matrix

| Criterion | Status |
|---|---|
| Phase 0: Shared Contracts & Baseline Invariants | 🟢 Complete & Verified |
| Phase 1: All Domain Repositories + PostgreSQL + RLS | 🟡 In Progress (3 of 7 Repositories Implemented, RLS Parameterized) |
| Phase 2: JWT + Authentication + RBAC | 🟡 In Progress (Issuer/Audience/Secret Hardened, Rotation/JWKS Pending) |
| Phase 3: Object Storage + Secure Parser + pgvector RAG | 🟡 Implemented / Needs S3 & Evaluation Suite |
| Phase 4: Transactional Outbox + Workers | 🟡 Designed / Outbox Worker Pending |
| Phase 5: Real Binary Exports (PDF/DOCX/XLSX/PPTX) | 🟢 Implemented & Tested |
| Phase 6: Webhooks + Deep SSRF Defense | 🟢 Implemented & Tested |
| Phase 7: AI Schemas + Persistent 12-Stage Journey | 🟡 Schemas Defined / DB State Machine Pending |
| Phase 8: AI Transformation Engines | 🟡 Implemented / Needs Engine Depth |
| Phase 9: Application Assessment Engine | 🟢 Implemented & Tested |
| Phase 10: Versioned Mathematical Dashboard | 🟢 Implemented & Tested |
| Phase 11: Web Frontend Live API Binding | 🟡 Prototype Live / Needs Real Navigation Binding |
| Phase 12: Collaboration & Approvals | 🟡 Implemented / Needs Scoped Feed Binding |
| Phase 13: Admin + AI Governance | 🟡 Basic Admin Live / Needs Governance & Token Budgets |
| Phase 14: React Native / Expo Mobile | 🔴 Needs Native Migration |
| Phase 15: Security + Observability + DR | 🟡 Health Checks Live / Needs DR Runbook |
| Phase 16: Concurrency + Performance + Load | 🟡 Load Tests Live / Needs Stress Validation |
| Phase 17: Golden Path E2E Final PRD Gate | 🔴 Final Gate Pending Complete Integration |

---

# 40. Execution Order

```text
Phase 0: Shared contracts + baseline invariants
  ↓
Phase 1: All domain repositories + PostgreSQL + RLS
  ↓
Phase 2: JWT + authentication + RBAC
  ↓
Phase 3: Object storage + secure parser + pgvector RAG
  ↓
Phase 4: Transactional outbox + workers
  ↓
Phase 5: Real binary exports
  ↓
Phase 6: Webhooks + SSRF
  ↓
Phase 7: AI schemas + persistent journey
  ↓
Phase 8: AI transformation engines
  ↓
Phase 9: Application assessment
  ↓
Phase 10: Dashboard + scoring
  ↓
Phase 11: Web frontend
  ↓
Phase 12: Collaboration + approvals
  ↓
Phase 13: Admin + governance
  ↓
Phase 14: React Native / Expo mobile
  ↓
Phase 15: Security + observability + DR
  ↓
Phase 16: Concurrency + performance + load
  ↓
Phase 17: Golden Path E2E
  ↓
FINAL PRD ACCEPTANCE
```
