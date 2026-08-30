/**
 * Solution Architecture Builder agent — TASK-014
 * POST /ai/v1/architecture/generate → HLD/LLD artifact incl. diagram_spec
 * DoD: Given fixture input, returns valid content schema; diagram_spec renders via TASK-018
 */

import { createArtifact } from "../stores/artifacts";

export interface ArchitectureContent {
  components: string[];
  integrations: string[];
  hldSections: { title: string; description: string }[];
  lldSections?: { title: string; description: string }[];
  diagramSpec: { nodes: { id: string; label: string; type: string }[]; edges: { from: string; to: string; label?: string }[] };
  cloudPreference?: string;
  compliance?: string[];
}

export interface ArchitectureRequest {
  projectId: string;
  orgId: string;
  type: "architecture_hld" | "architecture_lld";
  params?: { cloud_preference?: string; compliance?: string[] };
  conversationHistory?: { role: string; content: string }[];
  createdBy: string;
}

export function generateArchitecture(req: ArchitectureRequest): { artifactId: string; content: ArchitectureContent } {
  if (!req.projectId || !req.orgId) throw new Error("projectId and orgId required");
  const cloud = req.params?.cloud_preference || "azure";
  const compliance = req.params?.compliance || ["iso27001"];
  const isHld = req.type === "architecture_hld";

  const components = isHld
    ? ["API Gateway", "Core API", "AI Orchestrator", "Data Layer (Postgres + Vector)", "Object Storage", "Redis"]
    : ["Auth Service", "Workspace Service", "Project Service", "Document Pipeline", "AI Agents", "Export Service"];

  const integrations = ["SSO/SAML", "Payment Gateway", "Email Service", ...(cloud === "azure" ? ["Azure AD", "Azure Blob"] : ["AWS Cognito", "S3"])];

  const diagramSpec = {
    nodes: components.map((c, i) => ({ id: `n${i}`, label: c, type: i === 0 ? "gateway" : "service" })),
    edges: components.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}`, label: "calls" })),
  };

  const hldSections = [
    { title: "Overview", description: `HLD for ${req.projectId} on ${cloud} with ${compliance.join(", ")}` },
    { title: "Components", description: components.join(", ") },
    { title: "Integrations", description: integrations.join(", ") },
    { title: "Deployment", description: `Kubernetes on ${cloud}, Terraform IaC` },
  ];
  const lldSections = isHld
    ? undefined
    : [
        { title: "API Contracts", description: "REST /api/v1 with JWT orgId" },
        { title: "Data Model", description: "Postgres RLS by orgId, pgvector" },
        { title: "Security", description: "RBAC, encryption at rest & transit" },
      ];

  const content: ArchitectureContent = {
    components,
    integrations,
    hldSections,
    ...(lldSections ? { lldSections } : {}),
    diagramSpec,
    cloudPreference: cloud,
    compliance,
  };

  const artifact = createArtifact({
    projectId: req.projectId,
    orgId: req.orgId,
    type: req.type,
    title: `Architecture ${isHld ? "HLD" : "LLD"} — ${req.projectId.slice(0, 8)}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
    diagramUrl: null,
    parentArtifactId: null,
    generatedBy: "ai",
    createdBy: req.createdBy,
  });

  return { artifactId: artifact.id, content };
}

export function validateArchitectureContent(content: unknown): { valid: boolean; errors?: string[] } {
  const c = content as ArchitectureContent;
  const errors: string[] = [];
  if (!Array.isArray(c.components) || c.components.length === 0) errors.push("components required");
  if (!Array.isArray(c.integrations)) errors.push("integrations required");
  if (!Array.isArray(c.hldSections)) errors.push("hldSections required");
  if (!c.diagramSpec || !Array.isArray(c.diagramSpec.nodes) || !Array.isArray(c.diagramSpec.edges)) errors.push("diagramSpec nodes/edges required");
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}
