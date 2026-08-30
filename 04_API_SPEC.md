# API Specification (v1)
## Business Transformation AI (AI Solution Builder)

Base URL: `/api/v1`
Auth: `Authorization: Bearer <JWT>` on every request. Tenant (`org_id`) resolved from the JWT — never accepted as a client-supplied parameter.

### Conventions
- All list endpoints support `?page=&page_size=`.
- All mutation endpoints return the full updated resource.
- Errors: `{ "error": { "code": string, "message": string } }` with standard HTTP status codes.

---

### Auth & Orgs
```
POST   /auth/login
POST   /auth/sso/callback
GET    /orgs/me
GET    /orgs/:orgId/users
POST   /orgs/:orgId/users            (invite user)
PATCH  /orgs/:orgId/users/:userId    (role change)
```

### Workspaces & Projects
```
GET    /workspaces
POST   /workspaces
GET    /workspaces/:id
POST   /workspaces/:id/projects
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
POST   /projects/:id/members
```

### Documents & Context
```
POST   /projects/:id/documents            (multipart upload)
GET    /projects/:id/documents
GET    /documents/:id
DELETE /documents/:id
GET    /documents/:id/status              (parsed_status polling)
```

### Conversations (AI Transformation Companion)
```
POST   /projects/:id/conversations
GET    /conversations/:id
POST   /conversations/:id/messages        (send user message, returns AI reply)
GET    /conversations/:id/messages
```

### AI Orchestration (internal-facing, called by Core API — documented for completeness)
```
POST   /ai/v1/discovery/ask
POST   /ai/v1/business-analysis/generate
POST   /ai/v1/consultant/validate-idea
POST   /ai/v1/architecture/generate
POST   /ai/v1/process/generate-workflow
POST   /ai/v1/ux/generate-wireframes
POST   /ai/v1/data-model/generate
POST   /ai/v1/planning/estimate
POST   /ai/v1/planning/generate-roadmap
```
Each returns a structured artifact payload matching the `artifacts.content` schema for that type (see Data Model doc).

### Artifacts (client-facing — the primary surface for generated content)
```
GET    /projects/:id/artifacts?type=&status=
POST   /projects/:id/artifacts/generate    { type, source_conversation_id?, source_document_ids?, params }
GET    /artifacts/:id
GET    /artifacts/:id/versions
POST   /artifacts/:id/regenerate           { feedback? }
PATCH  /artifacts/:id                      (manual edit)
POST   /artifacts/:id/approve              { decision, comment? }
POST   /artifacts/:id/comments
GET    /artifacts/:id/comments
```

### Export
```
POST   /artifacts/:id/export               { format: pdf|docx|xlsx|pptx }  -> returns download URL
POST   /projects/:id/export-bundle         { artifact_ids[], format }      -> combined export
```

### Dashboard
```
GET    /projects/:id/dashboard             (maturity, readiness, health scores)
GET    /projects/:id/dashboard/history
```

### Admin
```
GET    /admin/orgs/:orgId/usage
GET    /admin/orgs/:orgId/audit-logs?actor=&action=&from=&to=
GET    /admin/orgs/:orgId/ai-models
PATCH  /admin/orgs/:orgId/ai-models/:module
GET    /admin/system/health
```

### Notifications
```
GET    /notifications
PATCH  /notifications/:id/read
```

---

### Sample: Generate Architecture Artifact
Request:
```json
POST /projects/proj_123/artifacts/generate
{
  "type": "architecture_hld",
  "source_conversation_id": "conv_456",
  "source_document_ids": ["doc_789"],
  "params": { "cloud_preference": "azure", "compliance": ["iso27001"] }
}
```
Response:
```json
{
  "id": "art_001",
  "type": "architecture_hld",
  "status": "draft",
  "version": 1,
  "content": {
    "components": ["API Gateway", "Core Service", "AI Orchestrator", "Data Layer"],
    "integrations": ["SSO/SAML", "Payment Gateway"],
    "diagram_spec": { "nodes": [...], "edges": [...] }
  },
  "diagram_url": "https://.../art_001_v1.svg",
  "created_at": "2026-08-30T10:00:00Z"
}
```
