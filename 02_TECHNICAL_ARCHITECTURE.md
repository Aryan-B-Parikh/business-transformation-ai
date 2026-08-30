# Technical Architecture Document
## Business Transformation AI (AI Solution Builder)

### 1. Architecture Style
Cloud-native, API-first, multi-tenant SaaS. Clients (Web, Android, iOS, Tablet) talk only to a versioned public API gateway — never directly to internal services or the AI orchestration layer.

```
[Web / Android / iOS / Tablet Clients]
              |
        [API Gateway]  (auth, rate limiting, tenant routing)
              |
   -----------------------------------------------------
   |          |            |             |              |
[Core API] [AI Orchestrator] [Document  [Export/       [Admin API]
(workspaces,  (agents, LLM    Pipeline]  Render Service]
 projects,     calls, RAG)   (ingest &
 users, RBAC)                 parse)
   |          |            |             |              |
   -----------------------------------------------------
              |
        [Data Layer]
   Postgres (tenant data) | Vector store (embeddings) |
   Object storage (docs, exports) | Redis (cache/queue)
```

### 2. Core Services

#### 2.1 Core API Service
Owns: organizations, workspaces, projects, users, roles/permissions, subscriptions.
- REST/GraphQL API, tenant-scoped by `org_id` on every table and every query.
- Auth: OAuth2/OIDC + SSO (SAML) for enterprise; JWT session tokens.

#### 2.2 AI Orchestration Service
Owns: all AI reasoning — the "brain" shared by web and mobile.
- Wraps LLM provider calls behind an internal contract (`/ai/v1/*`) so the provider can be swapped without client changes.
- Implements agents/skills mapped to product modules: `discovery-agent`, `business-analyst-agent`, `architecture-agent`, `process-agent`, `ux-agent`, `data-modeling-agent`, `planning-agent`.
- Maintains conversation/session state and organizational context via a RAG layer over the vector store (embeddings of uploaded documents + prior artifacts).
- Every agent call returns a structured, versioned "artifact" object (see Data Model) — never raw unstructured text only.

#### 2.3 Document Ingestion Pipeline
- Accepts PDF, PPTX, DOCX uploads.
- Parses text, tables, and structure; chunks and embeds into the vector store, tagged by workspace/project.
- Extracts existing-application metadata where provided (e.g., architecture diagrams, schemas) for context grounding.

#### 2.4 Export/Render Service
- Renders artifacts to PDF, DOCX, XLSX, PPTX on demand.
- Renders diagrams (BPMN, ER, architecture, wireframes) as SVG/PNG for in-app viewing and embeds them into exports.
- Stateless workers, horizontally scalable (diagram/document rendering is CPU-bound).

#### 2.5 Collaboration Service
- Comments, approvals, version history, notifications, activity log.
- Event-driven (publishes to a queue consumed by the notification worker).

#### 2.6 Admin Service
- Tenant/user/workspace management, security policy config, AI model selection per tenant, usage analytics, audit log query API, platform health dashboards.

### 3. Data Stores
| Store | Purpose |
|---|---|
| PostgreSQL (multi-tenant, row-level security by `org_id`) | Structured data: orgs, users, projects, artifacts, permissions, audit log |
| Vector DB (e.g., pgvector/Pinecone/Weaviate) | Embeddings for RAG over uploaded docs and prior artifacts |
| Object Storage (S3-compatible) | Uploaded files, rendered exports, diagram images |
| Redis | Session cache, job queues, rate limiting |

### 4. AI Orchestration Detail
- **Pattern**: Router agent classifies the user's intent/module, then delegates to a specialized agent with a scoped prompt + retrieved context (RAG) + relevant prior artifacts.
- **Grounding**: every agent call includes: (a) workspace's organizational context, (b) uploaded document excerpts relevant to the query, (c) prior artifact versions being modified.
- **Output contract**: agents return structured JSON matching the artifact schema for their module (e.g., architecture-agent returns `{components, integrations, hld_sections, diagram_spec}`), which the Export/Render Service then turns into diagrams/documents. Raw LLM text is never shown directly as a final artifact — it is parsed into structure first.
- **Human-in-the-loop**: every artifact has a status field (`draft → in_review → approved`) and cannot be marked "final" without explicit user action, per the advisory-only requirement.
- **Continuous improvement loop**: user feedback (accept/reject/edit) on artifacts is logged and used to refine future prompts/retrieval for that tenant (tenant-specific fine-tuning is out of scope for v1; use feedback for prompt/context tuning only).

### 5. Security & Multi-Tenancy
- Tenant isolation enforced at the database layer (row-level security) and at the vector store (namespace per tenant).
- RBAC roles: Org Admin, Workspace Admin, Contributor, Reviewer, Viewer — enforced in Core API middleware, checked on every request.
- All uploaded documents and AI context data encrypted at rest (AES-256) and in transit (TLS 1.2+).
- Full audit log: every artifact creation/edit/approval/export/permission change is recorded with actor, timestamp, and diff.

### 6. Non-Functional Targets
| Attribute | Target |
|---|---|
| AI response latency (discovery Q&A) | < 5s p95 |
| Full blueprint generation (architecture+workflow+wireframe+data model) | < 3 min p95 |
| Availability | 99.9% |
| RPO / RTO | ≤ 15 min / ≤ 2 hr |
| Concurrent tenants (v1 target) | 500 orgs, 10k users |

### 7. Suggested Tech Stack (starting point — confirm with team before locking)
- **Backend**: Node.js/TypeScript or Python (FastAPI) microservices
- **Frontend Web**: React + TypeScript
- **Mobile**: React Native or native Swift/Kotlin (shared design system either way)
- **AI**: Claude/GPT via API, LangChain/LlamaIndex-style orchestration (or custom), pgvector or managed vector DB
- **Diagramming**: server-side BPMN.js / mermaid / custom SVG renderers for architecture & ER diagrams
- **Infra**: Kubernetes on AWS/Azure/GCP, Terraform for IaC, GitHub Actions for CI/CD
