import { z } from "zod";
import { generateStructuredCompletion } from "../ai/llmProvider";
import { getRepositories } from "../repositories";
import { getGroundingContext } from "./ragGrounding";
/**
 * Process Intelligence Designer agent — TASK-015
 * POST /ai/v1/process/generate-workflow → BPMN/workflow artifact
 * DoD: Output validates against BPMN JSON schema; renders via TASK-018
 */

export const ProcessLLMSchema = z.object({
  bpmnJson: z.object({ lanes: z.array(z.object({ id: z.string(), name: z.string() })), nodes: z.array(z.object({ id: z.string(), type: z.string(), name: z.string(), lane: z.string() })), flows: z.array(z.object({ id: z.string(), from: z.string(), to: z.string() })) }),
  approvalWorkflows: z.array(z.object({ name: z.string(), steps: z.array(z.string()) })),
  decisionTrees: z.array(z.object({ question: z.string(), yes: z.string(), no: z.string() })),
  optimizationRecommendations: z.array(z.string()),
  diagramSpec: z.object({ nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string() })), edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })) }),
});



export interface ProcessContent {
  bpmnJson: { lanes: { id: string; name: string }[]; nodes: { id: string; type: string; name: string; lane: string }[]; flows: { id: string; from: string; to: string }[] };
  approvalWorkflows: { name: string; steps: string[] }[];
  decisionTrees: { question: string; yes: string; no: string }[];
  optimizationRecommendations: string[];
  diagramSpec: { nodes: { id: string; label: string; type: string }[]; edges: { from: string; to: string; label?: string }[] };
}

export interface ProcessRequest {
  projectId: string;
  orgId: string;
  createdBy: string;
  lang?: string;
  params?: { processName?: string };
}

function deterministicProcess(name: string): ProcessContent {
  const bpmnJson = { lanes: [{ id: "lane_sales", name: "Sales" }, { id: "lane_finance", name: "Finance" }, { id: "lane_system", name: "System" }], nodes: [{ id: "start", type: "startEvent", name: "Order Received", lane: "lane_sales" }, { id: "validate", type: "task", name: "Validate Payment", lane: "lane_finance" }, { id: "gateway", type: "exclusiveGateway", name: "Payment OK?", lane: "lane_finance" }, { id: "invoice", type: "task", name: "Generate Invoice", lane: "lane_system" }, { id: "end", type: "endEvent", name: "Completed", lane: "lane_system" }], flows: [{ id: "f1", from: "start", to: "validate" }, { id: "f2", from: "validate", to: "gateway" }, { id: "f3", from: "gateway", to: "invoice" }, { id: "f4", from: "invoice", to: "end" }] };
  const diagramSpec = { nodes: bpmnJson.nodes.map((n) => ({ id: n.id, label: n.name, type: n.type })), edges: bpmnJson.flows.map((f) => ({ from: f.from, to: f.to })) };
  return { bpmnJson, approvalWorkflows: [{ name: `${name} Approval`, steps: ["Submit", "Manager Review", "Finance Approval", "Done"] }], decisionTrees: [{ question: "Payment OK?", yes: "Generate Invoice", no: "Reject" }], optimizationRecommendations: ["Automate validation with RPA", "Add AI fraud check before gateway"], diagramSpec };
}

export async function generateProcess(req: ProcessRequest): Promise<{ artifactId: string; content: ProcessContent }> {
  const name = req.params?.processName || "Order to Cash";
  let content: ProcessContent;
  const hasLlmKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY); const allowLiveInTest = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) || process.env.FORCE_LIVE_LLM === "true"; const useLLM = hasLlmKey && process.env.LLM_PROVIDER !== "mock" && (process.env.NODE_ENV !== "test" || allowLiveInTest);
  const grounding = await getGroundingContext(req.orgId, req.projectId, `process workflow ${name}`, 5);
  if (useLLM) {
    try { content = await generateStructuredCompletion(`You are a Process Intelligence Designer. Generate BPMN workflow for ${name}. Return structured JSON only.`, `Generate BPMN workflow, approval workflows, decision trees for ${name}.${grounding.contextBlock}`, ProcessLLMSchema, { model: "gpt-4o-mini", orgId: req.orgId }); } catch { content = deterministicProcess(name); }
  } else content = deterministicProcess(name);

  const artifact = await getRepositories().artifacts.create(req.orgId, req.projectId, {
    type: "process_workflow",
    title: `Process — ${name}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
    createdBy: req.createdBy,
  });

  return { artifactId: artifact.id, content };
}

export function validateBpmnJson(content: unknown): { valid: boolean; errors?: string[] } {
  const c = content as ProcessContent;
  const errors: string[] = [];
  if (!c.bpmnJson || !Array.isArray(c.bpmnJson.nodes) || !Array.isArray(c.bpmnJson.flows) || !Array.isArray(c.bpmnJson.lanes)) errors.push("bpmnJson lanes/nodes/flows required");
  else {
    const ids = new Set(c.bpmnJson.nodes.map((n) => n.id));
    for (const f of c.bpmnJson.flows) {
      if (!ids.has(f.from) || !ids.has(f.to)) errors.push(`Flow ${f.id} references missing node`);
    }
  }
  if (!c.diagramSpec || !Array.isArray(c.diagramSpec.nodes)) errors.push("diagramSpec required");
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}
