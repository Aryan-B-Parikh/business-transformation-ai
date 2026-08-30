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
  // Fallback to original fetch if needed, though in unit tests we usually mock everything
  if (typeof originalFetch === "function" && (originalFetch as any).mock) {
    return (originalFetch as any)(url, options);
  }
  return { ok: true, json: async () => ({}) };
}) as any;
