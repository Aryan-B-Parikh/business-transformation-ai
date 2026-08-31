import { getRepositories } from "../repositories";
/**
 * Process Intelligence Designer agent — TASK-015
 * POST /ai/v1/process/generate-workflow → BPMN/workflow artifact
 * DoD: Output validates against BPMN JSON schema; renders via TASK-018
 */



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

export async function generateProcess(req: ProcessRequest): Promise<{ artifactId: string; content: ProcessContent }> {
  const name = req.params?.processName || "Order to Cash";
  const bpmnJson = {
    lanes: [
      { id: "lane_sales", name: "Sales" },
      { id: "lane_finance", name: "Finance" },
      { id: "lane_system", name: "System" },
    ],
    nodes: [
      { id: "start", type: "startEvent", name: "Order Received", lane: "lane_sales" },
      { id: "validate", type: "task", name: "Validate Payment", lane: "lane_finance" },
      { id: "gateway", type: "exclusiveGateway", name: "Payment OK?", lane: "lane_finance" },
      { id: "invoice", type: "task", name: "Generate Invoice", lane: "lane_system" },
      { id: "end", type: "endEvent", name: "Completed", lane: "lane_system" },
    ],
    flows: [
      { id: "f1", from: "start", to: "validate" },
      { id: "f2", from: "validate", to: "gateway" },
      { id: "f3", from: "gateway", to: "invoice" },
      { id: "f4", from: "invoice", to: "end" },
    ],
  };

  const diagramSpec = {
    nodes: bpmnJson.nodes.map((n) => ({ id: n.id, label: n.name, type: n.type })),
    edges: bpmnJson.flows.map((f) => ({ from: f.from, to: f.to })),
  };

  const content: ProcessContent = {
    bpmnJson,
    approvalWorkflows: [{ name: `${name} Approval`, steps: ["Submit", "Manager Review", "Finance Approval", "Done"] }],
    decisionTrees: [{ question: "Payment OK?", yes: "Generate Invoice", no: "Reject" }],
    optimizationRecommendations: ["Automate validation with RPA", "Add AI fraud check before gateway"],
    diagramSpec,
  };

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
