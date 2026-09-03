import { vi } from "vitest";

// Mock fetch globally so that parser sandbox calls don't hit localhost:8080 and fail with 404
if (!global.fetch) {
  global.fetch = vi.fn();
}

const originalFetch = global.fetch;
global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
  if (url.includes("/parse")) {
    const filename = options?.body?.get?.("file")?.name || options?.body?._streams?.[1] || "";
    let content = "mocked extracted document text content containing cloud migration and AI roadmap processes.";
    if (typeof filename === "string") {
      if (filename.includes("doc1")) content = "cloud infrastructure, virtual machines, AWS, Azure, GCP";
      if (filename.includes("doc2")) content = "employee onboarding, human resources, policies, handbook";
      if (filename.includes("doc3")) content = "BPMN workflow, automation, process orchestration, engine";
      if (filename.includes("sop")) content = "SOP Business Process: Order to Cash process description.";
    }
    return {
      ok: true,
      json: async () => ({ content })
    };
  }
  // Mock Gemini API calls for goldenPath test (CI environment may have flaky Gemini responses)
  if (url.includes("generativelanguage.googleapis.com")) {
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: JSON.stringify({
                  summary: "Mock AI-generated content for CI testing",
                  gapAnalysis: { gaps: [{ id: "g1", description: "Mock gap" }] },
                  stakeholderAnalysis: { stakeholders: [{ id: "s1", name: "Mock stakeholder" }] },
                  components: [{ id: "c1", name: "Mock component" }],
                  hldSections: [{ id: "h1", title: "Mock section" }],
                  diagramSpec: { nodes: [{ id: "n1", label: "Mock node" }], edges: [] },
                  bpmnJson: { nodes: [{ id: "bn1", label: "Mock bpmn" }], flows: [] },
                  screens: [{ id: "sc1", name: "Mock screen" }],
                  erDiagram: { entities: [{ name: "MockEntity", attributes: [] }] },
                  ddl: "CREATE TABLE mock (id UUID PRIMARY KEY);",
                  openapi: "3.0.0",
                  phases: [{ id: "p1", name: "Mock phase", durationMonths: 1 }],
                  items: [{ id: "i1", description: "Mock item", effortDays: 1 }],
                  totalEffort: 1
                }) }
              ]
            }
          }
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 }
      })
    };
  }
  // Fallback to original fetch if needed, though in unit tests we usually mock everything
  if (typeof originalFetch === "function" && (originalFetch as any).mock) {
    return (originalFetch as any)(url, options);
  }
  return { ok: true, json: async () => ({}) };
}) as any;
