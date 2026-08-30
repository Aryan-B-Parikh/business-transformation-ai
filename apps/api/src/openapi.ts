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
    "/openapi.json": {
      get: {
        summary: "OpenAPI spec",
        security: [],
        responses: { "200": { description: "Spec" } },
      },
    },
  },
} as const;
