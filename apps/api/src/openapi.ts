/**
 * OpenAPI spec generator — TASK-005
 * Generates spec matching 04_API_SPEC.md and serves at /api/v1/openapi.json
 * DoD: OpenAPI spec generated and matches 04_API_SPEC.md
 */

export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Business Transformation AI — Core API",
    version: "1.0.0",
    description: "API-first, multi-tenant SaaS. Tenant (org_id) resolved from JWT — never client-supplied. See 04_API_SPEC.md",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
      Workspace: {
        type: "object",
        required: ["id", "orgId", "name", "createdBy", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          createdBy: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Project: {
        type: "object",
        required: ["id", "workspaceId", "orgId", "name", "status", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          workspaceId: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "archived"] },
          createdAt: { type: "string", format: "date-time" },
          members: { type: "array", items: { type: "object" } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/login": {
      post: {
        summary: "Login",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "JWT + user" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/auth/sso/callback": {
      post: {
        summary: "SSO callback",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["provider", "code"],
                properties: { provider: { type: "string" }, code: { type: "string" }, email: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "JWT + user" } },
      },
    },
    "/orgs/me": {
      get: {
        summary: "Get own org",
        responses: { "200": { description: "Org" }, "401": { description: "Unauthorized" } },
      },
    },
    "/orgs/{orgId}/users": {
      get: {
        summary: "List users in org",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Users" }, "403": { description: "Cross-tenant denied" } },
      },
      post: {
        summary: "Invite user",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created" } },
      },
    },
    "/orgs/{orgId}/users/{userId}": {
      patch: {
        summary: "Change user role",
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string" } },
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Updated" } },
      },
    },
    "/workspaces": {
      get: {
        summary: "List workspaces",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "page_size", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "List" } },
      },
      post: {
        summary: "Create workspace",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } },
        },
        responses: { "201": { description: "Created" }, "403": { description: "Forbidden by role" } },
      },
    },
    "/workspaces/{id}": {
      get: {
        summary: "Get workspace",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Workspace" }, "404": { description: "Not found / cross-tenant" } },
      },
    },
    "/workspaces/{id}/projects": {
      post: {
        summary: "Create project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, status: { type: "string" } } } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/projects/{id}": {
      get: {
        summary: "Get project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Project" } },
      },
      patch: {
        summary: "Update project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, status: { type: "string" } } } } },
        },
        responses: { "200": { description: "Updated" }, "403": { description: "Forbidden" } },
      },
      delete: {
        summary: "Delete project",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Deleted" }, "403": { description: "Forbidden" } },
      },
    },
    "/projects/{id}/members": {
      post: {
        summary: "Add project member",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object", required: ["userId", "role"], properties: { userId: { type: "string" }, role: { type: "string" } } } },
          },
        },
        responses: { "201": { description: "Added" } },
      },
    },
    "/projects/{id}/documents": {
      post: { summary: "Upload document (multipart)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Document created" } } },
      get: { summary: "List documents", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Documents" } } },
    },
    "/documents/{id}": {
      get: { summary: "Get document", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Document" } } },
      delete: { summary: "Delete document", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "Deleted" } } },
    },
    "/documents/{id}/status": {
      get: { summary: "Document parse status", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Status" } } },
    },
    "/projects/{id}/rag/search": { post: { summary: "RAG search", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["query"], properties: { query: { type: "string" }, k: { type: "number" } } } } } }, responses: { "200": { description: "RAG hits" } } } },
    "/projects/{id}/rag/evaluate": { post: { summary: "RAG evaluate (recall/precision/citation)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" }, claims: { type: "array", items: { type: "string" } }, k: { type: "number" } } } } } }, responses: { "200": { description: "Evaluation metrics" } } } },
    "/projects/{id}/conversations": {
      post: { summary: "Create conversation", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Conversation" } } },
    },
    "/conversations/{id}": { get: { summary: "Get conversation", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Conversation" } } } },
    "/conversations/{id}/messages": {
      get: { summary: "List messages", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Messages" } } },
      post: { summary: "Send message (returns AI reply)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string" } } } } } }, responses: { "200": { description: "AI reply" } } },
    },
    "/ai/v1/discovery/ask": { post: { summary: "Discovery ask (internal AI)", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Discovery response" } } } },
    "/ai/v1/business-analysis/generate": { post: { summary: "Generate business analysis", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Artifact" } } } },
    "/ai/v1/architecture/generate": { post: { summary: "Generate architecture", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Artifact" } } } },
    "/ai/v1/process/generate-workflow": { post: { summary: "Generate workflow", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Artifact" } } } },
    "/ai/v1/ux/generate-wireframes": { post: { summary: "Generate wireframes", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Artifact" } } } },
    "/ai/v1/data-model/generate": { post: { summary: "Generate data model", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Artifact" } } } },
    "/ai/v1/planning/generate-roadmap": { post: { summary: "Generate roadmap", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Roadmap" } } } },
    "/ai/v1/planning/estimate": { post: { summary: "Estimate effort", requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { "200": { description: "Estimates" } } } },
    "/projects/{id}/artifacts": { get: { summary: "List artifacts", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "type", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Artifacts" } } } },
    "/projects/{id}/artifacts/generate": { post: { summary: "Generate artifact", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["type"], properties: { type: { type: "string" }, params: { type: "object" } } } } } }, responses: { "201": { description: "Artifact" } } } },
    "/artifacts/{id}": { get: { summary: "Get artifact", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Artifact" } } }, patch: { summary: "Edit artifact (creates new version)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "New version" } } } },
    "/artifacts/{id}/versions": { get: { summary: "Version history", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Versions" } } } },
    "/artifacts/{id}/diff": { get: { summary: "Diff two versions", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "from", in: "query", schema: { type: "integer" } }, { name: "to", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "Diff" } } } },
    "/artifacts/{id}/revert": { post: { summary: "Revert to version", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "New version" } } } },
    "/artifacts/{id}/regenerate": { post: { summary: "Regenerate artifact", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "New version" } } } },
    "/artifacts/{id}/render": { post: { summary: "Render diagram to SVG", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "SVG" } } } },
    "/artifacts/{id}/approve": { post: { summary: "Approve/reject artifact", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["approved","rejected","changes_requested"] } } } } } }, responses: { "200": { description: "Approval" } } } },
    "/artifacts/{id}/comments": { get: { summary: "List comments", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Comments" } } }, post: { summary: "Add comment", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Comment" } } } },
    "/artifacts/{id}/export": { post: { summary: "Export artifact", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["format"], properties: { format: { type: "string", enum: ["pdf","docx","xlsx","pptx"] } } } } } }, responses: { "200": { description: "Export" } } } },
    "/projects/{id}/export-bundle": { post: { summary: "Export bundle", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Bundle" } } } },
    "/exports/{id}/download": { get: { summary: "Download export", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "File" } } } },
    "/projects/{id}/dashboard": { get: { summary: "Dashboard scores", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Dashboard" } } } },
    "/projects/{id}/dashboard/history": { get: { summary: "Dashboard history", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "History" } } } },
    "/projects/{id}/journey": { get: { summary: "Get journey", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Journey" } } } },
    "/projects/{id}/journey/transition": { post: { summary: "Transition journey stage", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Journey" } } } },
    "/projects/{id}/journey/rollback": { post: { summary: "Rollback journey", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Journey" } } } },
    "/projects/{id}/activity": { get: { summary: "Activity feed", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Activity" } } } },
    "/notifications": { get: { summary: "List notifications", responses: { "200": { description: "Notifications" } } } },
    "/notifications/{id}/read": { patch: { summary: "Mark notification read", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } } },
    "/admin/orgs/{orgId}/usage": { get: { summary: "Org usage", parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Usage" } } } },
    "/admin/orgs/{orgId}/audit-logs": { get: { summary: "Audit logs", parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Logs" } } } },
    "/admin/orgs/{orgId}/ai-models": { get: { summary: "List AI models", parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Models" } } } },
    "/admin/orgs/{orgId}/ai-models/{module}": { patch: { summary: "Update AI model", parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }, { name: "module", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } } },
    "/admin/orgs/{orgId}/api-keys": {
      get: { summary: "List API keys", parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Keys" } } },
      post: { summary: "Create API key", parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { scopes: { type: "array", items: { type: "string" } } } } } } }, responses: { "201": { description: "Key with raw" } } },
    },
    "/admin/orgs/{orgId}/api-keys/{id}": { delete: { summary: "Delete API key", parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }, { name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "Deleted" } } } },
    "/admin/system/health": { get: { summary: "System health", responses: { "200": { description: "Health" } } } },
    "/webhooks": { post: { summary: "Create webhook", responses: { "201": { description: "Webhook" } } }, get: { summary: "List webhooks", responses: { "200": { description: "Webhooks" } } } },
    "/openapi.json": {
      get: {
        summary: "OpenAPI spec",
        security: [],
        responses: { "200": { description: "Spec" } },
      },
    },
  },
} as const;
