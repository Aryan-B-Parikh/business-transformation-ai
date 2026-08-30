/**
 * AI UX Designer agent — TASK-017
 * POST /ai/v1/ux/generate-wireframes → wireframe artifact (screen list + layout spec)
 * DoD: Output renders as low-fidelity wireframe images via TASK-018
 */

import { createArtifact } from "../stores/artifacts";

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
  params?: { appType?: string };
}

export function generateUx(req: UxRequest): { artifactId: string; content: UxContent } {
  const appType = req.params?.appType || "Dashboard";
  const screens = [
    { id: "login", name: "Login", type: "auth", components: [{ type: "input", label: "Email", x: 10, y: 10, w: 200, h: 30 }, { type: "button", label: "Login", x: 10, y: 50, w: 200, h: 40 }] },
    { id: "dashboard", name: `${appType} Dashboard`, type: "dashboard", components: [{ type: "header", label: "Header", x: 0, y: 0, w: 800, h: 60 }, { type: "chart", label: "Maturity Chart", x: 10, y: 70, w: 380, h: 200 }, { type: "table", label: "Projects", x: 400, y: 70, w: 380, h: 200 }] },
    { id: "projects", name: "Projects List", type: "list", components: [{ type: "list", label: "Project List", x: 10, y: 10, w: 780, h: 400 }] },
  ];
  const navigationFlow = [
    { from: "login", to: "dashboard", action: "login" },
    { from: "dashboard", to: "projects", action: "click projects" },
  ];
  const layoutSpec = screens.map((s) => ({ screenId: s.id, layout: `${s.type} layout with ${s.components.length} components` }));
  const diagramSpec = {
    nodes: screens.map((s) => ({ id: s.id, label: s.name, type: s.type })),
    edges: navigationFlow.map((n) => ({ from: n.from, to: n.to, label: n.action })),
  };

  const content: UxContent = { screens, navigationFlow, layoutSpec, diagramSpec };

  const artifact = createArtifact({
    projectId: req.projectId,
    orgId: req.orgId,
    type: "wireframe",
    title: `Wireframe — ${appType}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
    diagramUrl: null,
    parentArtifactId: null,
    generatedBy: "ai",
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
