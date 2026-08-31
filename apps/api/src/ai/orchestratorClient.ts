/**
 * Orchestrator client — Core API can delegate /ai/v1/* to standalone ai-orchestrator service.
 * If AI_ORCHESTRATOR_URL is not set, caller should fallback to direct service call.
 */
export async function forwardToOrchestrator(path: string, body: unknown): Promise<{ forwarded: boolean; data?: unknown }> {
  const base = process.env.AI_ORCHESTRATOR_URL;
  if (!base) return { forwarded: false };
  const url = `${base.replace(/\/$/, "")}${path}`;
  const token = process.env.AI_ORCHESTRATOR_TOKEN;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Internal-Token"] = token;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) return { forwarded: false };
    const data = await res.json();
    return { forwarded: true, data };
  } catch {
    return { forwarded: false };
  }
}
