# Data Model
## Business Transformation AI (AI Solution Builder)

Notation: table_name(field: type, ...). PK = primary key, FK = foreign key. All tables include `org_id` (tenant) except `organizations` itself.

### Core Entities

```
organizations(
  id: uuid PK,
  name: string,
  plan: enum[trial, standard, enterprise],
  created_at: timestamp
)

users(
  id: uuid PK,
  org_id: uuid FK -> organizations.id,
  email: string,
  name: string,
  role: enum[org_admin, workspace_admin, contributor, reviewer, viewer],
  sso_provider: string nullable,
  created_at: timestamp
)

workspaces(
  id: uuid PK,
  org_id: uuid FK,
  name: string,
  created_by: uuid FK -> users.id,
  created_at: timestamp
)

projects(
  id: uuid PK,
  workspace_id: uuid FK,
  org_id: uuid FK,
  name: string,
  status: enum[active, archived],
  created_at: timestamp
)

project_members(
  project_id: uuid FK,
  user_id: uuid FK,
  role: enum[owner, contributor, reviewer, viewer]
)
```

### Input / Context Entities

```
documents(
  id: uuid PK,
  project_id: uuid FK,
  org_id: uuid FK,
  filename: string,
  type: enum[pdf, pptx, docx, sop, brd, other],
  storage_url: string,
  parsed_status: enum[pending, parsed, failed],
  uploaded_by: uuid FK -> users.id,
  created_at: timestamp
)

document_chunks(
  id: uuid PK,
  document_id: uuid FK,
  org_id: uuid FK,
  chunk_text: text,
  embedding: vector,
  page_ref: int nullable
)

conversations(
  id: uuid PK,
  project_id: uuid FK,
  org_id: uuid FK,
  started_by: uuid FK -> users.id,
  created_at: timestamp
)

conversation_messages(
  id: uuid PK,
  conversation_id: uuid FK,
  org_id: uuid FK,
  role: enum[user, ai],
  content: text,
  created_at: timestamp
)
```

### Artifact Entities (the generated "solution blueprint")

```
artifacts(
  id: uuid PK,
  project_id: uuid FK,
  org_id: uuid FK,
  type: enum[
    recommendation, business_analysis, architecture_hld, architecture_lld,
    process_workflow, bpmn_diagram, wireframe, er_diagram, api_spec,
    roadmap, effort_estimate, dashboard_snapshot
  ],
  title: string,
  status: enum[draft, in_review, approved],
  content: jsonb,          -- structured content per type (schema varies by `type`)
  diagram_url: string nullable,   -- rendered SVG/PNG if applicable
  version: int,
  parent_artifact_id: uuid FK -> artifacts.id nullable,  -- link to previous version
  generated_by: enum[ai, user, hybrid],
  created_by: uuid FK -> users.id,
  created_at: timestamp
)

artifact_comments(
  id: uuid PK,
  artifact_id: uuid FK,
  org_id: uuid FK,
  author_id: uuid FK -> users.id,
  parent_comment_id: uuid FK nullable,
  content: text,
  created_at: timestamp
)

artifact_approvals(
  id: uuid PK,
  artifact_id: uuid FK,
  org_id: uuid FK,
  approver_id: uuid FK -> users.id,
  decision: enum[approved, rejected, changes_requested],
  comment: text nullable,
  created_at: timestamp
)
```

### Planning & Dashboard Entities

```
roadmap_items(
  id: uuid PK,
  artifact_id: uuid FK -> artifacts.id,   -- parent roadmap artifact
  org_id: uuid FK,
  title: string,
  phase: string,
  start_estimate: date,
  end_estimate: date,
  dependencies: uuid[] -- other roadmap_item ids
)

effort_estimates(
  id: uuid PK,
  artifact_id: uuid FK,
  org_id: uuid FK,
  item_name: string,
  effort_hours: numeric,
  cost_estimate: numeric,
  risk_level: enum[low, medium, high]
)

maturity_snapshots(
  id: uuid PK,
  project_id: uuid FK,
  org_id: uuid FK,
  digital_maturity_score: numeric,
  ai_readiness_score: numeric,
  automation_opportunity_score: numeric,
  captured_at: timestamp
)
```

### Governance & Admin Entities

```
audit_logs(
  id: uuid PK,
  org_id: uuid FK,
  actor_id: uuid FK -> users.id,
  action: string,        -- e.g. "artifact.approve", "user.role_change"
  target_type: string,
  target_id: uuid,
  metadata: jsonb,
  created_at: timestamp
)

ai_model_configs(
  id: uuid PK,
  org_id: uuid FK,
  module: string,         -- e.g. "architecture-agent"
  provider: string,
  model_name: string,
  enabled: boolean
)

notifications(
  id: uuid PK,
  org_id: uuid FK,
  user_id: uuid FK,
  type: string,
  payload: jsonb,
  read: boolean,
  created_at: timestamp
)
```

### Key Relationships (ERD summary)
```
organizations 1---N users
organizations 1---N workspaces
workspaces    1---N projects
projects      1---N documents / conversations / artifacts / roadmap_items / maturity_snapshots
artifacts     1---N artifact_comments, artifact_approvals
artifacts     1---1 parent_artifact_id (version chain)
```

### Row-Level Security Note
Every table above (except `organizations`) carries `org_id`. Enforce Postgres RLS policies so a query without a matching `org_id` context returns zero rows — this is the primary multi-tenant isolation control referenced in the architecture doc.
