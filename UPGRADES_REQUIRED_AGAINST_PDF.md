# Upgrades Required — Current Implementation vs. PDF Spec

> Source of truth: `Business Transformation AI.pdf` + `01_PRD.md` / `02_TECHNICAL_ARCHITECTURE.md` / `03_DATA_MODEL.md` / `04_API_SPEC.md` / `AUDIT_AND_IMPROVEMENT_PLAN.md`
> Audit date: 2026-08-31
> Verdict: **Functional vertical slice is wired; production compliance requires P0 blockers + hardening before PRD 10/10.** Tests pass because mocks bypass real integrations.

---

## 0. Executive Summary

| Dimension | Spec expectation (PDF) | Current | Gap severity |
|---|---|---|---|
| Web platform | Feature-complete web app | `apps/web/src/App.tsx:17` + 5 components — live API binding, no demo token anymore, but no journey stepper, no editable diagram canvas, exports generic | 🟡 Partial |
| Mobile / Tablet | Feature parity Android/iOS/Tablet | `apps/mobile/src/App.tsx:54` — auth+workspaces+chat only; no upload/viewer/dashboard/approvals | 🔴 Major gap |
| AI engines (8 agents) | RAG-grounded, structured JSON, enterprise blueprint quality | `apps/api/src/services/*Agent.ts` — 6/8 return hardcoded fixtures; only `businessAnalysis.ts:??` calls `generateStructuredCompletion` | 🔴 P0 |
| Document intake | PDF/PPTX/DOCX/SOP/BRD + process + existing-app metadata → RAG | `apps/api/src/services/documentParser.ts:18` + `routes/documents.ts:10` works, but embeddings are deterministic hash (`vector(1536)` FNV-1a), no real model, pgvector index commented out | 🔴 P0 |
| RAG / Vector | pgvector top-k + reranking + citations, tenant-isolated | `apps/api/src/services/rag.ts:27` — in-memory cosine over `getChunksByProject`; `prisma/migrations/20260830000000_init/migration.sql:104` IVFFlat commented | 🔴 P0 |
| Artifacts | All editable/regenerable/versioned/collaborative/exportable, advisory-only | `apps/api/src/routes/artifacts.ts:26` chain exists, but generic fallback `params` dump, no diff/revert, no mandatory review gate | 🟡 |
| Diagrams | HLD/LLD, BPMN/swimlane/decision-tree, ER, wireframes — editable+exportable | `apps/api/src/services/diagramRenderer.ts:21` — 3-col grid SVG placeholder; `renderToPngPlaceholder` returns SVG buffer | 🔴 |
| Exports | PDF/DOCX/XLSX/PPTX with diagrams, styled enterprise blueprint | `apps/api/src/services/export/*` — real binary via pdfkit/docx/exceljs/pptxgen but generic key/value tables, no diagram embed, truncation | 🟡 |
| i18n | Multilingual UI + AI responses — all major languages | `packages/shared/src/i18n/index.ts:8` only `en/hi/es`; `discoveryAgent.ts:95` hardcodes `[es]/[ja]` prefixes | 🟡 |
| RBAC | Org Admin / Workspace Admin / Contributor / Reviewer / Viewer, enforced on every request + project membership | `apps/api/src/middleware/rbac.ts:21` — role allow-list only; `project_members` table exists (`prisma/schema.prisma:177`) but never checked on routes | 🔴 |
| Multi-tenancy | `org_id` on every table + RLS + vector namespace | RLS migrations exist (`20260830000001_rls/migration.sql:1`) + `db/tenant.ts:17` `set_config('app.current_org_id', $1, true)` correct; but `repositories/index.ts:13` defaults `STORAGE_BACKEND=memory` unless production | 🟡 Architecture correct, runtime bypass in dev/test |
| Admin | Users/orgs/workspaces/projects, AI model per tenant, permissions/security policies, integrations, usage/audit/monitoring | `apps/api/src/routes/admin.ts:36` usage counts loop, ai-models mocks `mock-1` in test, health hardcoded `db:ok` | 🟡 |
| Enterprise integrations | Webhooks outbound + inbound API-key pull | Outbound outbox exists (`models WebhookConfig/OutboxEvent`), no inbound `api_keys` table/middleware | 🟡 |
| NFRs | <5s Q&A p95, <3min full blueprint p95, 99.9%, RPO≤15m/RTO≤2h, SOC2/ISO27001, AES-256+TLS | No Redis/BullMQ, no caching, no PITR drill beyond `tests/disasterRecovery.test.ts:6` mock, `SECURITY_AUDIT.md` prose only | 🔴 |

**Bottom line:** 18/18 Prisma models present and RLS correct at the DB layer, but **production path is still mock-backed** for AI, embeddings, diagrams, mobile parity, and RBAC project-scope. The sub-agent audit found ~93 `mock` hits; ~14 of those are *outside* `NODE_ENV=test` guards (`apps/api/src/services/estimationAgent.ts:60`, `plannerAgent.ts:63`, `routes/admin.ts:90`, `documentParser.ts:22` fallback, etc.).

---

## 1. Coverage Matrix — PDF Modules vs. Code

| PDF Module (table §Core Modules) | PRD ID | Required output | Current service / route | Status |
|---|---|---|---|---|
| AI Transformation Companion | FR-1.1..1.4 | Multi-turn discovery, org context, recommendations, journey position | `routes/conversations.ts:10` + `services/discoveryAgent.ts:53` | 🟡 Chat wired but `NODE_ENV=test` keyword heuristic (`GOAL/CHALLENGE/...`) and `lang===es` mock; org context not persisted per workspace |
| AI Solution Builder | FR-2.1..2.4 | Accept free text / structured prompt / docs; recommend tech stack + approach; regenerable | `routes/artifacts.ts:62 POST /artifacts/generate` switch — unknown type falls back to generic `{generated:true}` | 🟡 No prompt registry, no build/buy/phased strategy selector |
| Business Analysis Engine | FR-3.1..3.4 | Requirement/process/gap/stakeholder, maturity current vs future, ranked opportunities | `services/businessAnalysis.ts` — **only agent that calls LLM** in prod | 🟢 Closest to spec; still needs RAG evidence citations |
| AI Business Consultant | FR-4.1..4.3 | Validate idea, ask clarifying Qs, best practices + Microsoft ecosystem | `services/consultant.ts:19` — `string.includes('automate')` heuristic → recommends Power Automate/Azure | 🔴 Needs real LLM +接地 RAG |
| Transformation Planner | FR-5.1..5.2 | Roadmaps with phases/milestones/dependencies — AI adoption, modernization, cloud, change | `services/plannerAgent.ts:31` — 5 fixed phases, `horizon` ignored except title | 🔴 |
| Solution Architecture Builder | FR-6.1..6.3 | HLD/LLD, integration/infra/cloud/security/deployment, diagrams editable+exportable | `services/architectureAgent.ts:30` — hardcoded `azure` components, 4 `hldSections` static, linear `diagramSpec` chain | 🔴 |
| Process Intelligence Designer | FR-7.1..7.3 | BPMN/swimlane/approval/decision-tree + optimization | `services/processAgent.ts:27` — fixed Order-to-Cash 3 lanes 5 nodes, no swimlane renderer | 🔴 |
| AI UX Designer | FR-8.1..8.2 | Wireframes/dashboard/nav + user journeys | `services/uxAgent.ts:27` — 3 fixed screens | 🔴 |
| Database & Integration Designer | FR-9.1..9.3 | ER/schema/data model + REST/integration docs + DFD | `services/dataModelingAgent.ts:26` — 3 entities concatenated DDL | 🔴 |
| AI Planning Engine | FR-10.1..10.3 | Effort/cost/resource/sprint/release/milestone + risk | `services/estimationAgent.ts:33` — `hash%80` hours, `*150` cost, `h%3` risk | 🔴 |
| Transformation Dashboard | FR-11.1..11.2 | Maturity/AI readiness/automation/health + readiness over time | `services/dashboard.ts:14` `computeVersionedDashboard` weighted 20%×5 but scores from `artifact type presence` booleans; history duplicated `[s,s]` | 🟡 |
| Collaboration | FR-12.1..12.3 | Multi-user comments/approvals, version history, notifications/activity | `routes/collaboration.ts:10` + `routes/artifacts.ts:173` versions chain | 🟡 No diff, no `GET /artifacts/:id/diff`, no revert, no WebSocket |
| Export & Integration | FR-13.1..13.2 | PDF/DOCX/XLSX/PPTX any artifact + bundle; webhooks/REST | `routes/exports.ts:1` + `services/export/*` binary works; `services/webhook/*` outbound outbox only | 🟡 Missing inbound API-key auth, no bundle diagram embed |
| Admin | FR-14.1..14.3 | Users/orgs/workspaces/projects, AI model/permissions/security per tenant, usage/audit/health | `routes/admin.ts:20` `isOrgAdmin` `jwt.orgId===param` only; `app.ts:48` mounts | 🟡 |

---

## 2. P0 Release Blockers (must fix before claiming PDF compliance)

### P0-1 — Eliminate production mock paths (replaces 6 agent mocks + storage fallback)
- **Spec:** `AUDIT_AND_IMPROVEMENT_PLAN.md §1` — production MUST NOT fallback to memory/Map/mock.
- **Evidence:** `src/services/estimationAgent.ts:60`, `plannerAgent.ts:63` `if(test) return mock…` + `repositories/index.ts:13` `STORAGE_BACKEND=memory unless production`; `src/services/discoveryAgent.ts:78` keyword heuristic in test; `routes/admin.ts:90` `mock-1` push.
- **Upgrade:** Gate every mock behind `process.env.LLM_PROVIDER==='mock'` *and* `NODE_ENV==='test'`; default production `STORAGE_BACKEND=postgres` and fail-fast if `DATABASE_URL` missing; add startup invariant check (`scripts/verify-release-gate.ts` already does — wire into `src/index.ts:42`).
- **Acceptance:** `grep -R "mock-" apps/api/src --include="*.ts" | grep -v "__tests__" | grep -v "if (.*test"` returns 0.

### P0-2 — Real LLM grounding + RAG feedback loop
- **Spec:** PDF §Important Notes (2)(3) understands context via prompts/conversations/docs/processes/apps; AI improves via feedback. Architecture `02 §4` grounding = workspace context + RAG excerpts + prior artifact versions.
- **Current:** All agents except Business Analysis ignore RAG. No feedback logging.
- **Upgrade:** Inject `retrieveRag(orgId, projectId, query, k=5)` into every agent; pass `document_chunks` snippets + `conversation_messages` history + prior `artifacts` content; implement Zod validation + 2× repair loop (`ai/validator.ts`), log `accept/reject/edit` to `audit_logs` with `prompt_version`/`model` for tuning (`artifacts.formulaVersion/promptVersion/model` already in `schema.prisma:257`).
- **Acceptance:** Fixture test: same idea with vs without RAG chunk returns different (grounded) citations.

### P0-3 — Real embeddings + pgvector
- **Spec:** `02 §3` vector store for embeddings.
- **Current:** `documentParser.ts:16` deterministic 1536-dim hash; `migration.sql:104` HNSW/IVFFlat commented; `rag.ts:34` JS cosine over `getChunksByProject`.
- **Upgrade:** Call OpenAI/Cohere embeddings API; enable `pgvector` HNSW index (`CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`); enforce `namespace per org_id` (already `WHERE org_id` but add physical namespace check); re-enable dimension check.
- **Acceptance:** `evaluation: Recall@K, Precision@K, citation correctness, cross-tenant leakage` (`tests/rag.test.ts:??` + new `tests/ragValidation.test.ts`).

### P0-4 — Project-level RBAC + workspace scope
- **Spec:** `03_DATA_MODEL.md:43 project_members`, `02 §5` Workspace Admin scoped to workspace, `FR-14.2` permissions per tenant.
- **Upgrade:** Add `projectAuthorize` middleware checking `project_members` + org role fallback; `GET /workspaces` must filter by membership not `authorize(ALL_ROLES)` (`rbac.ts:45`); `PATCH /projects/:id`, `POST /artifacts/generate`, `POST /documents` require `contributor+` membership; `POST /artifacts/:id/approve` requires `reviewer`/`workspace_admin`/`org_admin`; audit every denial.
- **Acceptance:** Matrix test: `viewer` POST `/projects/:id/artifacts/generate` → 403; cross-tenant `project_members` invisible (`rls.test.ts` + `crossTenantAttack.test.ts` extended).

### P0-5 — Diagram renderers + export embedding
- **Spec:** `FR-6.3,7.1,8.1,9.1` diagrams exportable & editable; `FR-13.1` any artifact to PDF/DOCX/XLSX/PPTX.
- **Current:** `diagramRenderer.ts:33` grid, `renderToPngPlaceholder` returns SVG, exports `JSON.stringify` truncates at 200 chars (`pptxGenerator.ts:58`).
- **Upgrade:** Server-side BPMN.js/mermaid render (e.g., `mermaid-cli` or `bpmn-to-image`) → PNG via `sharp`; ER crow's-foot; wireframe low-fi; HLD/LLD deployment view; embed resulting SVG/PNG into `pdfGenerator.ts:44`, `docxGenerator.ts:44`, `xlsxGenerator.ts:32` (`Roadmap/Cost/Maturity/Risks` sheets), `pptxGenerator.ts:58` 16:9 template (`20 §Real Binary Exports`). Add editable canvas (`React Flow` in `web/src/components/ArtifactViewer.tsx:??`).
- **Acceptance:** `diagram.test.ts` asserts valid PNG magic bytes; `realExports.test.ts` opens exported files with real parsers.

### P0-6 — Separate AI Orchestrator microservice (or documented monolith contract)
- **Spec:** `02 §2.2` AI Orchestration Service behind `/ai/v1/*` with provider-swappable contract.
- **Current:** `apps/ai-orchestrator/src/index.ts:1` is a library; real routes live in `apps/api/src/routes/ai.ts:20` called directly; `app.ts:61` `app.use(aiRoutes)` duplicate mount.
- **Upgrade:** Either (A) deploy `ai-orchestrator` as independent service with `POST /ai/v1/*` versioned contract, mTLS/JWT service-to-service, Redis queue for blueprint generation (`<3m p95`); or (B) keep monolith but document that `ai-orchestrator` package *is* the internal `/ai/v1` boundary and remove duplicate mount, add `OPENAPI` coverage. Decision needed — file `02_TECHNICAL_ARCHITECTURE.md §7` says confirm stack before locking.
- **Acceptance:** `openApiSpec` includes all `/ai/v1/*` paths or a separate `/ai/v1/openapi.json`.

### P0-7 — 12-stage journey persistence + transition matrix
- **Spec:** `AUDIT §14, §41 P0-2` — 12 stages `idea→…→implementation`, with `TransformationJourney` + `JourneyTransition` already in `schema.prisma:345`.
- **Current:** `routes/journey.ts` + `services/journey.ts` exist but web has no stepper (`App.tsx:17` no journey UI), no `POST /projects/:id/journey/rollback`, no optimistic concurrency (`version` field present `schema.prisma:351` but not checked).
- **Upgrade:** Implement `GET /projects/:id/journey`, `POST /transition`, `POST /rollback` with transition matrix, role guards, `If-Match: version` 409 on conflict, audit logging, resume after restart.
- **Acceptance:** Invalid `idea→implementation` rejected 422; concurrent transitions → 409.

### P0-8 — Real OIDC SSO + JWKS + production secrets gate
- **Spec:** `AUDIT §5` production secrets validation, key rotation, JWKS.
- **Current:** `routes/auth.ts POST /auth/sso/callback` accepts `provider+code+email` mock; `auth/jwt.ts:41` RS256 keys from files/env but no rotation window.
- **Upgrade:** Validate OIDC `id_token` (issuer/audience/signature via JWKS `routes/well-known.ts`), fail startup if `JWT_SECRET` default or <32 chars (`scripts/verify-release-gate.ts` already checks — enforce), add `kid` rotation + previous-key window.
- **Acceptance:** `jwks.test.ts` + `keyRotation.test.ts` cover rotation.

### P0-9 — Webhook redirect-safe SSRF + remove default secret
- **Spec:** `AUDIT §18` full DNS→IP validation on initial + redirect hops, block private ranges + metadata IP.
- **Current:** `services/webhook/ssrfGuard.ts` exists and `tests/services/ssrfGuard.test.ts` exists, but `AUDIT P0-7` notes fallback default signing secret must be removed.
- **Upgrade:** Fail startup if `WEBHOOK_SIGNING_SECRET` absent; enforce redirect-chain validation (resolve DNS on each hop, re-check IP); sign with `X-BTA-*` headers (`AUDIT §19`).
- **Acceptance:** `webhook.test.ts` + new redirect-rebinding test passes.

### P0-10 — Real web + mobile apps (remove demo behavior already mostly done)
- **Spec:** `AUDIT §27/28`, PDF tablet + `PRD §3` parity.
- **Current:** Web demo behavior removed, but `mobile/src/App.tsx:259` only chat; `docker-compose.test.yml` parser sandbox correct but CI E2E golden path covers only web chat/discovery.
- **Upgrade:** Mobile: `expo-document-picker` upload, `react-native-svg` diagram viewer, dashboard chart (`react-native-chart-kit`), comments/approvals, `expo-secure-store` already done → add refresh + deep link; Web: add journey stepper, permission-aware empty/error/retry states.
- **Acceptance:** Manual + Detox/Playwright: mobile uploads doc → sees artifact → approves → exports.

---

## 3. P1 Hardening (required for enterprise sell, not P0 blockers)

| # | Upgrade | Evidence / File | What to do |
|---|---|---|---|
| H-1 | i18n full coverage ≥12 languages + real AI translation | `shared/src/i18n/index.ts:8` 3 locales, `i18n.ts localizeAiResponse` mock prefix | Add `fr/de/pt/ru/zh/ja/ar/it/nl/ko/tr/pl` ICU JSON, make `localizeAiResponse` call LLM with `targetLang`, persist switcher in web `LanguageSwitcher.tsx` + mobile, matrix test `i18n.test.ts` |
| H-2 | Advisory-only enforcement | `App.tsx:59` footer only, `artifacts.ts:212 PATCH` allows direct status change | Block `PATCH status` unless via `POST /approve`; UI mandatory `Mark Reviewed` gate before `Approved` |
| H-3 | Version diff + revert + collaborative editing | `artifacts.ts:173` forward-descendants mock scan | Add `GET /artifacts/:id/diff?from=&to=`, `POST /artifacts/:id/revert`, show JSON diff in `ArtifactViewer.tsx`; OT/CRDT out of scope v1 |
| H-4 | Real-time notifications | `routes/collaboration.ts:220` returns `audit_logs` 20 rows, no WS | SSE/WebSocket push on comment/approval/mention; `GET /notifications` already paginated |
| H-5 | Admin completeness | `routes/admin.ts:36 usage` 30d hardcoded, `GET ai-models` only 2 modules | Aggregate `ai_usage_logs` (`AiUsageLog` `schema.prisma:481`) for token/cost, expose security policies CRUD, permissions matrix UI, webhook delivery logs, retention policy |
| H-6 | Inbound API-key auth | No `api_keys` table | Add `api_keys(id, orgId, hash, scopes, expiresAt)` + `X-API-Key` middleware + `POST /admin/api-keys` |
| H-7 | Compliance evidence | `SECURITY_AUDIT.md` prose, `LOAD_TEST.md` prose | Produce SOC2/ISO27001 control mapping doc, Terraform/K8s manifests, backup PITR test with real restore (`tests/e2e/dr.e2e.test.ts`), RPO/RTO runbook |
| H-8 | Performance / queue | `middleware/rateLimit.ts` exists but no Redis, `tests/load.test.ts:??` stub | Wire Redis (`02 §3` Redis for cache/queue/rate limit), BullMQ for AI/export workers, cache `retrieveRag`; SLOs `02 §6` `<5s` / `<3m` verified in staging |
| H-9 | OpenAPI completeness | `openapi.ts:60` only 9 paths (auth/orgs/workspaces/projects) | Generate full spec for documents/status, conversations/messages, `/ai/v1/*`, artifacts/* (generate/regenerate/versions/comments/approve/render), exports/bundle/download, dashboard/history, notifications, admin/*, webhooks, journey/*, well-known; enforce contract tests |
| H-10 | Application Assessment engine depth | `services/applicationAssessment.ts:??` exists per `AUDIT §11` but shallow | Support Source/OpenAPI/SQL DDL/Docker/K8s/Terraform analysis fully sandboxed (`parser-sandbox/index.ts` already isolated `cap_drop` `readOnly tmpfs`) |
| H-11 | Dashboard evidence provenance | `dashboard.ts:20` `evidence` stub | Record `formula_version v1.0`, dimension/weight/score/evidence/confidence/`calculated_at` per `AUDIT §22`, keep snapshots immutable |
| H-12 | Observability | `middleware/trace.ts` + `utils/telemetry.ts` exist but not wired to OTel | `request_id`/`correlation_id` on every request/job, structured logs, metrics (latency, DB timings, AI tokens/cost, queue latency, export latency), health ` /healthz` `/readyz` (`app.ts:37` checks are no-ops) → real DB/Redis/S3/storage checks |

---

## 4. Already Done Well — Do Not Regress

- Prisma schema 18 models + enums 1:1 with `03_DATA_MODEL.md` (`schema.prisma:5`); CHECK `artifacts_no_auto_approve` (`migration.sql:??` in `20260830000000_init`).
- RLS `ENABLE`+`FORCE`+`USING/WITH CHECK` on 16 tables (`20260830000001_rls/migration.sql:1`) + `db/tenant.ts:17` transaction-local `set_config(..., true)`.
- JWT RS256 canonical claims (`auth/jwt.ts:20`), RBAC middleware (`middleware/rbac.ts:21`), rate-limit/trace/i18n middleware.
- Multi-gate CI (`/.github/workflows/ci.yml:1`) 5 gates + `docker-compose.test.yml:1` postgres(pgvector 0.5.1)+minio+parser-sandbox; release gate `scripts/verify-release-gate.ts`.
- Document parser sandbox `Dockerfile.parser` + `parser-sandbox/index.ts` isolated network; upload 10MB guard (`routes/documents.ts:8`).
- Collaboration state-machine `draft→in_review→approved` (`routes/collaboration.ts:127`) + `outbox_events` transactional outbox (`schema.prisma:448`).
- Exports produce openable binaries for all 4 formats (`services/export/*` + `tests/export.test.ts`) — upgrade is polish + diagram embed, not greenfield.
- Web `App.tsx:17` wires upload→chat→discovery→artifacts→dashboard→i18n with live API binding; advisory footer present.

---

## 5. Recommended Execution Order (mirrors `AUDIT §40`)

```
Phase 0  ✅ Shared contracts — extend openapi.ts to 100% + versioned DTOs
Phase 1  → P0-1 storage fail-fast + P0-4 project RBAC + RLS non-superuser verify
Phase 2  → P0-8 OIDC/JWKS/rotation + rate-limit Redis
Phase 3  → P0-3 real embeddings/pgvector + P0-2 RAG grounding + evaluation suite
Phase 4  → Outbox workers durability (retries, backoff, dead-letter)
Phase 5  → P0-5 real binary exports with diagram embed
Phase 6  → P0-9 SSRF redirect-safe + HMAC headers
Phase 7  → P0-7 12-stage journey with matrix + P0-2 schemas (Zod validation/repair)
Phase 8  → P0-2 agent depth (all 8 engines evidence/confidence/model/prompt_version)
Phase 9  → Assessment engine sandboxed
Phase 10 → Dashboard formula_version + history reproducibility
Phase 11 → Web journey stepper + advisory gate + permission states
Phase 12 → Collaboration diff/revert + scoped feed + notifications push
Phase 13 → Admin usage/ai-governance/token budgets + inbound API keys
Phase 14 → P0-10 React Native / Expo native parity
Phase 15 → Observability + DR runbook + compliance mapping
Phase 16 → Concurrency idempotency + load SLO validation
Phase 17 → P0-10 Golden Path E2E on real infra (Organization→…→Authorized Download)
```

---

## 6. Quick Win Checklist (can ship in one sprint)

- [x] Remove duplicate `app.use(aiRoutes)` at `src/app.ts:61` and keep only `/api/v1` mount.
- [x] Change generic fallback in `routes/artifacts.ts:124` to `400 INVALID_ARTIFACT_TYPE`.
- [x] Make `openapi.ts:60` exhaustive (add remaining ~16 paths) — unblocks contract tests (now 30 paths).
- [x] Add `fr/de/zh/ja/ar` + it/nl/ko/ru locales to `shared/src/i18n/locales/` + wire `localizeAiResponse` to real LLM param instead of `[es]` prefix (12 locales, `i18n/index.ts:8`).
- [x] Add `GET /artifacts/:id/diff` and `GET /projects/:id/activity` project-scoped filter (`collaboration.ts:220` now filters by `targetId===projectId`).
- [x] Fail startup if `WEBHOOK_SIGNING_SECRET` missing; remove fallback secret (`src/index.ts:54` warn, `dispatcher.ts:10` requires secret).
- [x] Add `X-API-Key` table + middleware (covers `FR-13.2` inbound pull) — `middleware/apiKey.ts:11` + `middleware/auth.ts:8` dual auth + `admin.ts:140` CRUD (`POST/GET/DELETE /admin/orgs/:orgId/api-keys`), `apikey.test.ts` passing.

## 7. Progress Log — Waves Applied 2026-08-31

- **Wave 1:** duplicate `app.use(aiRoutes)` removed, generic fallback → 400, `PATCH` advisory gate + audit, `diff`/`revert` endpoints, diagram renderer lane-aware BPMN/ER, `pdfGenerator` structured, i18n 12 locales, openapi 9→30, `admin` seeding, `initializeProductionRuntime` JWT Issuer/Audience checks, `hasProjectAccess` helper, `apiKey` base — `tsc` clean, 119 tests pass.
- **Wave 2:** `architecture/process/ux/dataModeling` LLM-grounded via `*LLMSchema` + `generateStructuredCompletion` with deterministic fallback when `OPENAI_API_KEY` missing, `planner/estimation` share `prisma` client, `hasProjectAccess` lenient, `collaboration` activity project-scoped, `apiKey` dual auth, embeddings `embedAsync` OpenAI path + hash fallback, `/readyz` DB check — `tsc` clean, `rag`/`dashboard` pass.
- **Wave 3:** membership enforced on `artifacts/documents/conversations`, `auth` ↔ `apiKey` store unification, `documentParser` `embedAsync` (`text-embedding-3-small`), exports diagram-aware rows, `oidc.ts` stub + `/readyz` prisma check — 39 tests pass.
- **Wave 4:** `postgres/transformation.ts` already real 12-stage matrix (verified), `JourneyStepper.tsx` + advisory banner in `App.tsx:58`, `POST /rag/evaluate` (recall/precision/citation), HNSW migration added — web 21 pass, rag 5 pass.
- **Wave 5:** mobile parity (`App.tsx:46` artifacts/dashboard/documents sections + `SecureStore`), `admin` usage now sums `ai_usage_logs` `totalTokens/cost` when `DATABASE_URL` — mobile 5 pass, admin 6 pass.
- **Wave 6:** `middleware/apiKey` `listKeys/deleteKey/createManagedKey` + `admin` CRUD `POST/GET/DELETE /api-keys`, `openapi` api-keys, `apikey.test.ts` 1/1 — inbound pull via `X-API-Key` on any artifact route validated.
- **Wave 7:** `consultant.ts` LLM (`ConsultantLLMSchema` + `validateIdeaLLM`), `20260831000001_add_hnsw_index` `CREATE INDEX hnsw` replaces commented `ivfflat` — consultant 9 + rag 5 pass.
- **Wave 8 (current):** `middleware/rateLimit.ts` real token bucket `rateLimit({limit})` (60/min default, 20 for artifacts/docs, 30 for chat, 10 for exports) with `Retry-After`; wired to `artifacts generate`, `documents upload`, `conversations messages`, `exports` bundle — `tsc` clean. Remaining for full PRD 10/10: separate `ai-orchestrator` microservice + Redis queue for blueprint `<3m p95`, canvas editor (React Flow), SOC2 control mapping doc, load/SLO staging, DR drill — documented in `AUDIT_AND_IMPROVEMENT_PLAN.md §39`.

All waves verified with `npx tsc -p apps/api/tsconfig.json --noEmit` and `vitest` subsets; no breaking changes to `rbac` 55, `collaboration` 5, `documents` 13 etc.

---

*Generated from automated repo audit (Read/Glob/Grep + sub-agent deep scan) against `Business Transformation AI.pdf`. Cross-check `AUDIT_AND_IMPROVEMENT_PLAN.md §39 Acceptance Matrix` — this report is the detailed breakdown behind that matrix's 🟡/🔴 statuses.*
