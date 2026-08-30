import { z } from "zod";

// ==========================================
// Generic API Envelope & Error
// ==========================================
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ==========================================
// Authentication & RBAC
// ==========================================
export const UserRoleSchema = z.enum([
  "org_admin",
  "workspace_admin",
  "contributor",
  "reviewer",
  "viewer",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const JwtPayloadSchema = z.object({
  sub: z.string(),
  org_id: z.string(),
  role: UserRoleSchema,
  iss: z.string().optional(),
  aud: z.string().optional(),
  exp: z.number().optional(),
  iat: z.number().optional(),
  // Backward compatibility alias during transition
  userId: z.string().optional(),
  orgId: z.string().optional(),
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// ==========================================
// Transformation Journey
// ==========================================
export const JourneyStageSchema = z.enum([
  "idea",
  "discovery",
  "business_analysis",
  "solution_design",
  "architecture",
  "process_design",
  "ux_design",
  "data_design",
  "planning",
  "review",
  "approved",
  "implementation",
]);
export type JourneyStage = z.infer<typeof JourneyStageSchema>;

export const JourneyStatusSchema = z.enum(["pending", "in_progress", "completed", "blocked"]);
export type JourneyStatus = z.infer<typeof JourneyStatusSchema>;

// ==========================================
// Artifacts & LifeCycle
// ==========================================
export const ArtifactTypeSchema = z.enum([
  "recommendation",
  "business_analysis",
  "architecture_hld",
  "architecture_lld",
  "process_workflow",
  "bpmn_diagram",
  "wireframe",
  "er_diagram",
  "api_spec",
  "roadmap",
  "effort_estimate",
  "dashboard_snapshot",
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const ArtifactStatusSchema = z.enum(["draft", "in_review", "approved", "changes_requested"]);
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;

// ==========================================
// RAG Response with Citations
// ==========================================
export const RagCitationSourceSchema = z.object({
  documentId: z.string(),
  page: z.number().optional(),
  chunkId: z.string(),
  snippet: z.string(),
  relevance: z.number(),
});

export const RagAnswerResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(RagCitationSourceSchema),
  confidence: z.number().min(0).max(1),
});
export type RagAnswerResponse = z.infer<typeof RagAnswerResponseSchema>;

// ==========================================
// Dashboard Versioned Metrics
// ==========================================
export const MetricDimensionSchema = z.object({
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

export const DashboardMaturityModelSchema = z.object({
  formula_version: z.string().default("v1.0"),
  calculated_at: z.string(),
  digital_maturity: z.object({
    overall: z.number().min(0).max(100),
    dimensions: z.object({
      process: MetricDimensionSchema,
      technology: MetricDimensionSchema,
      data: MetricDimensionSchema,
      automation: MetricDimensionSchema,
      governance: MetricDimensionSchema,
    }),
  }),
  ai_readiness: z.number().min(0).max(100),
  automation_opportunity: z.number().min(0).max(100),
  project_health: z.number().min(0).max(100),
  implementation_readiness: z.number().min(0).max(100),
});
export type DashboardMaturityModel = z.infer<typeof DashboardMaturityModelSchema>;
