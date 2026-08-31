import { z } from "zod";
import { generateStructuredCompletion } from "../ai/llmProvider";
import { getRepositories } from "../repositories";
/**
 * AI UX Designer agent — TASK-017
 * POST /ai/v1/ux/generate-wireframes → wireframe artifact (screen list + layout spec)
 * DoD: Output renders as low-fidelity wireframe images via TASK-018
 */

export const UxLLMSchema = z.object({
  screens: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), components: z.array(z.object({ type: z.string(), label: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })) })).min(1),
  navigationFlow: z.array(z.object({ from: z.string(), to: z.string(), action: z.string() })),
  layoutSpec: z.array(z.object({ screenId: z.string(), layout: z.string() })),
  diagramSpec: z.object({ nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string() })), edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })) }),
});



export interface UxContent {
  screens: { id: string; name: string; type: string; components: { type: string; label: string; x: number; y: number; w: number; h: number }[] }[];
  navigationFlow: { from: string; to: string; action: string }[];
  layoutSpec: { screenId: string; layout: string }[];
  diagramSpec: { nodes: { id: string; label: string; type: string }[]; edges: { from: string; to: string; label?: string }[] };
}

export interface UxRequest {
  projectId: string;
  orgId: string;
  createdBy: string;
  lang?: string;
  params?: { appType?: string };
}

function deterministicUx(appType: string): UxContent {
  const screens = [{ id: "login", name: "Login", type: "auth", components: [{ type: "input", label: "Email", x: 10, y: 10, w: 200, h: 30 }, { type: "button", label: "Login", x: 10, y: 50, w: 200, h: 40 }] }, { id: "dashboard", name: `${appType} Dashboard`, type: "dashboard", components: [{ type: "header", label: "Header", x: 0, y: 0, w: 800, h: 60 }, { type: "chart", label: "Maturity Chart", x: 10, y: 70, w: 380, h: 200 }, { type: "table", label: "Projects", x: 400, y: 70, w: 380, h: 200 }] }, { id: "projects", name: "Projects List", type: "list", components: [{ type: "list", label: "Project List", x: 10, y: 10, w: 780, h: 400 }] }];
  const navigationFlow = [{ from: "login", to: "dashboard", action: "login" }, { from: "dashboard", to: "projects", action: "click projects" }];
  const layoutSpec = screens.map((s) => ({ screenId: s.id, layout: `${s.type} layout with ${s.components.length} components` }));
  const diagramSpec = { nodes: screens.map((s) => ({ id: s.id, label: s.name, type: s.type })), edges: navigationFlow.map((n) => ({ from: n.from, to: n.to, label: n.action })) };
  return { screens, navigationFlow, layoutSpec, diagramSpec };
}

export async function generateUx(req: UxRequest): Promise<{ artifactId: string; content: UxContent }> {
  const appType = req.params?.appType || "Dashboard";
  let content: UxContent;
  const useLLM = process.env.OPENAI_API_KEY && process.env.LLM_PROVIDER !== "mock" && process.env.NODE_ENV !== "test";
  if (useLLM) {
    try {
      content = await generateStructuredCompletion(`You are an AI UX Designer. Generate wireframes for appType=${appType}. Return structured JSON only.`, `Generate wireframe for ${appType} with login, dashboard, projects flows.`, UxLLMSchema, { model: "gpt-4o-mini", orgId: req.orgId });
    } catch { content = deterministicUx(appType); }
  } else content = deterministicUx(appType);

  const artifact = await getRepositories().artifacts.create(req.orgId, req.projectId, {
    type: "wireframe",
    title: `Wireframe — ${appType}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
    createdBy: req.createdBy,
  });

  return { artifactId: artifact.id, content };
}

export function validateUx(content: unknown): { valid: boolean; errors?: string[] } {
  const c = content as UxContent;
  const errors: string[] = [];
  if (!Array.isArray(c.screens) || c.screens.length === 0) errors.push("screens required");
  if (!Array.isArray(c.navigationFlow)) errors.push("navigationFlow required");
  if (!c.diagramSpec || !Array.isArray(c.diagramSpec.nodes)) errors.push("diagramSpec required");
  for (const s of c.screens || []) {
    if (!Array.isArray(s.components)) errors.push(`screen ${s.id} components required`);
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}
