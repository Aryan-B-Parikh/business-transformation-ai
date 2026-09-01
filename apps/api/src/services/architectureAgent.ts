import { z } from "zod";
import { generateStructuredCompletion } from "../ai/llmProvider";
import { getRepositories } from "../repositories";
import { getGroundingContext } from "./ragGrounding";
/**
 * Solution Architecture Builder agent — TASK-014
 * POST /ai/v1/architecture/generate → HLD/LLD artifact incl. diagram_spec
 * DoD: Given fixture input, returns valid content schema; diagram_spec renders via TASK-018
 * LLM-grounded: when OPENAI_API_KEY present, generates via structured completion with Zod validation + repair;
 * otherwise deterministic fallback (test/mock).
 */

export const ArchitectureLLMSchema = z.object({
  components: z.array(z.string()).min(1),
  integrations: z.array(z.string()),
  hldSections: z.array(z.object({ title: z.string(), description: z.string() })).min(1),
  lldSections: z.array(z.object({ title: z.string(), description: z.string() })).optional(),
  diagramSpec: z.object({ nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string() })), edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })) }),
  cloudPreference: z.string().optional(),
  compliance: z.array(z.string()).optional(),
});



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
  lang?: string;
}

function deterministicContent(req: ArchitectureRequest, cloud: string, compliance: string[], isHld: boolean): ArchitectureContent {
  const components = isHld
    ? ["API Gateway", "Core API", "AI Orchestrator", "Data Layer (Postgres + Vector)", "Object Storage", "Redis"]
    : ["Auth Service", "Workspace Service", "Project Service", "Document Pipeline", "AI Agents", "Export Service"];
  const integrations = ["SSO/SAML", "Payment Gateway", "Email Service", ...(cloud === "azure" ? ["Azure AD", "Azure Blob"] : ["AWS Cognito", "S3"])];
  const diagramSpec = { nodes: components.map((c, i) => ({ id: `n${i}`, label: c, type: i === 0 ? "gateway" : "service" })), edges: components.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}`, label: "calls" })) };
  const hldSections = [{ title: "Overview", description: `HLD for ${req.projectId} on ${cloud} with ${compliance.join(", ")}` }, { title: "Components", description: components.join(", ") }, { title: "Integrations", description: integrations.join(", ") }, { title: "Deployment", description: `Kubernetes on ${cloud}, Terraform IaC` }];
  const lldSections = isHld ? undefined : [{ title: "API Contracts", description: "REST /api/v1 with JWT orgId" }, { title: "Data Model", description: "Postgres RLS by orgId, pgvector" }, { title: "Security", description: "RBAC, encryption at rest & transit" }];
  return { components, integrations, hldSections, ...(lldSections ? { lldSections } : {}), diagramSpec, cloudPreference: cloud, compliance };
}

export async function generateArchitecture(req: ArchitectureRequest): Promise<{ artifactId: string; content: ArchitectureContent }> {
  if (!req.projectId || !req.orgId) throw new Error("projectId and orgId required");
  const cloud = req.params?.cloud_preference || "azure";
  const compliance = req.params?.compliance || ["iso27001"];
  const isHld = req.type === "architecture_hld";

  let content: ArchitectureContent;
  const useLLM = process.env.OPENAI_API_KEY && process.env.LLM_PROVIDER !== "mock" && process.env.NODE_ENV !== "test";
  const historyText = (req.conversationHistory || []).map((m) => `${m.role}: ${m.content}`).join("\n").slice(0, 4000);
  const grounding = await getGroundingContext(req.orgId, req.projectId, historyText || `${req.type} ${cloud}`, 5);
  if (useLLM) {
    try {
      content = await generateStructuredCompletion(`You are a Solution Architecture Builder. Generate ${isHld ? "HLD" : "LLD"} architecture. Cloud=${cloud}, compliance=${compliance.join(",")}. Return structured JSON only.`, `Project ${req.projectId} context:\n${historyText}\nGenerate architecture for cloud ${cloud}.${grounding.contextBlock}`, ArchitectureLLMSchema, { model: "gpt-4o-mini", orgId: req.orgId });
    } catch {
      content = deterministicContent(req, cloud, compliance, isHld);
    }
  } else {
    content = deterministicContent(req, cloud, compliance, isHld);
  }

  const artifact = await getRepositories().artifacts.create(req.orgId, req.projectId, {
    type: req.type,
    title: `Architecture ${isHld ? "HLD" : "LLD"} — ${req.projectId.slice(0, 8)}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
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
