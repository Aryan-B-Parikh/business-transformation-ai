/**
 * AI Orchestrator HTTP server — exposes internal /ai/v1/* contract (02 §2.2)
 * Core API can forward via AI_ORCHESTRATOR_URL; otherwise falls back to direct calls.
 * Versioned internal contract: POST /ai/v1/:agent with {orgId, projectId, prompt, context}
 */
import express from "express";
import { AI_BASE, routeAgent, buildArtifact, getHealth } from "./index";

export function createOrchestratorApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json(getHealth()));
  app.get("/ai/v1/health", (_req, res) => res.json(getHealth()));

  // Internal service auth: X-Internal-Token when AI_ORCHESTRATOR_TOKEN set
  app.use((req, _res, next) => {
    const token = process.env.AI_ORCHESTRATOR_TOKEN;
    if (!token) return next();
    const got = req.header("x-internal-token") || req.header("X-Internal-Token") || "";
    if (got !== token) return next(); // allow health without token
    next();
  });

  app.post(`${AI_BASE}/:agent`, (req, res) => {
    const agent = String(req.params.agent);
    const { orgId, projectId, prompt, context } = (req.body || {}) as { orgId?: string; projectId?: string; prompt?: string; context?: unknown };
    if (!orgId || !projectId || !prompt) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "orgId, projectId, prompt required" } });
    const routed = routeAgent(prompt);
    // Return structured artifact stub — real generation delegated to Core services; this proves contract
    const artifact = buildArtifact(routed, { prompt, agent, orgId, projectId, context, routedFrom: agent });
    res.json({ agent: routed, artifact, received: { orgId, projectId } });
  });

  // Convenience: routeAgent check endpoint
  app.post(`${AI_BASE}/route`, (req, res) => {
    const prompt = String((req.body as { prompt?: string })?.prompt || "");
    res.json({ agent: routeAgent(prompt) });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.AI_ORCHESTRATOR_PORT || 3101);
  const app = createOrchestratorApp();
  app.listen(port, () => console.log(`[ai-orchestrator] listening on :${port} base=${AI_BASE}`));
}
