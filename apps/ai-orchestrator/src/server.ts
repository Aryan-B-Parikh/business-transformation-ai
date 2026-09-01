/**
 * Standalone AI orchestrator HTTP service.
 * The orchestrator is intentionally independent of the API workspace so its
 * Docker image can be built and deployed without importing API source files.
 */

import http from "http";
import { URL } from "url";
import { routeAgent, buildArtifact, SERVICE_NAME, SERVICE_VERSION } from "./index";

const PORT = Number(process.env.AI_ORCHESTRATOR_PORT || 7070);
const SERVICE_TOKEN = process.env.AI_ORCHESTRATOR_SERVICE_TOKEN || "";
const REQUEST_TIMEOUT_MS = Number(process.env.AI_ORCHESTRATOR_TIMEOUT_MS || 30000);

interface IncomingRequest {
  agent?: string;
  orgId: string;
  projectId: string;
  workspaceId?: string;
  prompt: string;
  context?: { conversationHistory?: unknown[]; ragChunks?: string[]; priorArtifacts?: unknown[] };
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function invokeLLM(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for the AI orchestrator");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_ORCHESTRATOR_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`LLM invocation failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned no structured content");
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("LLM returned a non-object JSON artifact");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error(`LLM request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/ai/v1/health") {
    jsonResponse(res, 200, { service: SERVICE_NAME, version: SERVICE_VERSION, status: "ok" });
    return;
  }

  if (req.method !== "POST" || !url.pathname.startsWith("/ai/v1/")) {
    jsonResponse(res, 404, { error: { code: "NOT_FOUND", message: "Unknown route" } });
    return;
  }

  if (SERVICE_TOKEN && req.headers.authorization !== `Bearer ${SERVICE_TOKEN}`) {
    jsonResponse(res, 401, { error: { code: "UNAUTHORIZED", message: "Invalid service token" } });
    return;
  }

  let body = "";
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1_000_000) {
        jsonResponse(res, 413, { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 1 MB" } });
        return;
      }
    }
  } catch {
    jsonResponse(res, 400, { error: { code: "BAD_REQUEST", message: "Unable to read request body" } });
    return;
  }

  let parsed: IncomingRequest;
  try {
    parsed = JSON.parse(body) as IncomingRequest;
  } catch {
    jsonResponse(res, 400, { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } });
    return;
  }

  if (!parsed.orgId || !parsed.projectId || !parsed.prompt) {
    jsonResponse(res, 400, { error: { code: "BAD_REQUEST", message: "orgId, projectId and prompt are required" } });
    return;
  }

  try {
    const agent = parsed.agent || routeAgent(parsed.prompt);
    const ragChunks = parsed.context?.ragChunks || [];
    const grounding = ragChunks.length ? `\n\n=== RAG Context ===\n${ragChunks.join("\n")}` : "";
    const systemPrompt = `You are the ${agent} agent of the Business Transformation AI orchestrator. Return structured JSON only.`;
    const content = await invokeLLM(systemPrompt, parsed.prompt + grounding);
    const artifact = buildArtifact(agent, content);
    jsonResponse(res, 200, { agent, artifact, service: SERVICE_NAME, version: SERVICE_VERSION });
  } catch (error) {
    jsonResponse(res, 500, { error: { code: "INTERNAL_ERROR", message: (error as Error).message } });
  }
});

server.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} listening on http://localhost:${PORT}/ai/v1/*`);
});
