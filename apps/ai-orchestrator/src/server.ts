/**
 * AI Orchestrator microservice — standalone entrypoint.
 * Implements POST /ai/v1/* per 02_TECHNICAL_ARCHITECTURE.md §2.2.
 * When AI_ORCHESTRATOR_URL is set, the main API delegates here via service-to-service JWT.
 * Otherwise the API embeds the same agents directly (monolith mode).
 *
 * Run: AI_ORCHESTRATOR_PORT=7070 node apps/ai-orchestrator/dist/server.js
 */

import http from "http";
import { URL } from "url";
import { routeAgent, buildArtifact, SERVICE_NAME, SERVICE_VERSION } from "./index";
import { retrieveRag } from "../api/src/services/rag";
import { generateStructuredCompletion } from "../api/src/ai/llmProvider";
import { z } from "zod";

const PORT = Number(process.env.AI_ORCHESTRATOR_PORT || 7070);
const SERVICE_TOKEN = process.env.AI_ORCHESTRATOR_SERVICE_TOKEN || "";

interface IncomingRequest {
  agent: string;
  orgId: string;
  projectId: string;
  workspaceId?: string;
  prompt: string;
  context?: { conversationHistory?: unknown[]; ragChunks?: string[]; priorArtifacts?: unknown[] };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Health
  if (req.method === "GET" && url.pathname === "/ai/v1/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ service: SERVICE_NAME, version: SERVICE_VERSION, status: "ok" }));
    return;
  }

  // Service-to-service auth check
  if (req.method === "POST" && url.pathname.startsWith("/ai/v1/")) {
    const auth = req.headers["authorization"];
    if (SERVICE_TOKEN && auth !== `Bearer ${SERVICE_TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid service token" } }));
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed: IncomingRequest;
    try {
      parsed = JSON.parse(body) as IncomingRequest;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }));
      return;
    }

    try {
      const agent = parsed.agent || routeAgent(parsed.prompt);
      const ragChunks = parsed.context?.ragChunks || [];
      const grounding = ragChunks.length ? "\n\n=== RAG Context ===\n" + ragChunks.join("\n") : "";
      const systemPrompt = `You are the ${agent} agent of the Business Transformation AI orchestrator. Return structured JSON.`;
      const userPrompt = parsed.prompt + grounding;
      const content = await generateStructuredCompletion(
        systemPrompt,
        userPrompt,
        // permissive schema — orchestrator doesn't enforce artifact-specific shapes here
        z.object({}).passthrough(),
        { model: "gpt-4o-mini", orgId: parsed.orgId }
      );
      const artifact = buildArtifact(agent, content as Record<string, unknown>);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agent, artifact, service: SERVICE_NAME, version: SERVICE_VERSION }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Unknown route" } }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} listening on http://localhost:${PORT}/ai/v1/*`);
});
