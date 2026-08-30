/**
 * @bta/shared — Shared types & utilities
 * Mirrors contracts from 03_DATA_MODEL.md and 04_API_SPEC.md
 */

export type OrgPlan = "trial" | "standard" | "enterprise";
export type UserRole = "org_admin" | "workspace_admin" | "contributor" | "reviewer" | "viewer";
export type ProjectStatus = "active" | "archived";
export type DocumentType = "pdf" | "pptx" | "docx" | "sop" | "brd" | "other";
export type ParsedStatus = "pending" | "parsed" | "failed";
export type ArtifactType =
  | "recommendation"
  | "business_analysis"
  | "architecture_hld"
  | "architecture_lld"
  | "process_workflow"
  | "bpmn_diagram"
  | "wireframe"
  | "er_diagram"
  | "api_spec"
  | "roadmap"
  | "effort_estimate"
  | "dashboard_snapshot";
export type ArtifactStatus = "draft" | "in_review" | "approved";
export type EffortRisk = "low" | "medium" | "high";

export interface ArtifactContent {
  // Generic — each artifact type has a more specific schema validated via JSON Schema (TASK-014+)
  [key: string]: unknown;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export const API_VERSION = "v1";
export const API_BASE = `/api/${API_VERSION}`;

// Tenant isolation helper: every DB row must carry org_id (except organizations)
// Used by services to enforce RLS-style checks
export function requireOrgId(orgId: string | undefined): string {
  if (!orgId) throw new Error("org_id is required — tenant context missing");
  return orgId;
}

// Human-in-the-loop guard — AI artifacts must never auto-approve
export function assertNotAutoApproved(status: ArtifactStatus, generatedBy: string): void {
  if (generatedBy === "ai" && status === "approved") {
    throw new Error("AI-generated artifact cannot be auto-approved; human review required");
  }
}

export const RBAC_ROLES: UserRole[] = [
  "org_admin",
  "workspace_admin",
  "contributor",
  "reviewer",
  "viewer",
];

export * from "./i18n";
export * from "./contracts";
