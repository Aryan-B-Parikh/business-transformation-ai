/**
 * @bta/ai-orchestrator — AI Orchestration Service
 * Wraps LLM provider behind internal contract /ai/v1/* (02 §2.2)
 * Implements agents: discovery, business-analyst, architecture, process, ux, data-modeling, planning
 */

import { API_BASE, assertNotAutoApproved } from "@bta/shared";

export const SERVICE_NAME = "ai-orchestrator";
export const SERVICE_VERSION = "0.1.0";
export const AI_BASE = "/ai/v1";

export type AgentName =
  | "discovery-agent"
  | "business-analyst-agent"
  | "architecture-agent"
  | "process-agent"
  | "ux-agent"
  | "data-modeling-agent"
  | "planning-agent";

export interface AgentRequest {
  agent: AgentName;
  workspaceId: string;
  projectId: string;
  orgId: string;
  prompt: string;
  context?: { conversationHistory?: unknown[]; ragChunks?: string[]; priorArtifacts?: unknown[] };
}

export interface AgentArtifact {
  type: string;
  status: "draft" | "in_review" | "approved";
  content: Record<string, unknown>;
  generatedBy: "ai" | "user" | "hybrid";
}

// Router: classify intent -> delegate to specialized agent (02 §4)
export function routeAgent(prompt: string): AgentName {
  const p = prompt.toLowerCase();
  if (p.includes("architecture") || p.includes("hld") || p.includes("lld")) return "architecture-agent";
  if (p.includes("workflow") || p.includes("bpmn") || p.includes("process")) return "process-agent";
  if (p.includes("wireframe") || p.includes("ux") || p.includes("screen")) return "ux-agent";
  if (p.includes("database") || p.includes("er diagram") || p.includes("api spec")) return "data-modeling-agent";
  if (p.includes("roadmap") || p.includes("estimate") || p.includes("planning")) return "planning-agent";
  if (p.includes("gap") || p.includes("maturity") || p.includes("stakeholder")) return "business-analyst-agent";
  return "discovery-agent";
}

// Output contract: structured artifact — never raw text only (02 §4)
export function buildArtifact(type: string, content: Record<string, unknown>): AgentArtifact {
  const artifact: AgentArtifact = { type, status: "draft", content, generatedBy: "ai" };
  assertNotAutoApproved(artifact.status, artifact.generatedBy);
  return artifact;
}

export function getHealth() {
  return { service: SERVICE_NAME, version: SERVICE_VERSION, status: "ok" as const, aiBase: AI_BASE, coreBase: API_BASE };
}

if (require.main === module) {
  console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} — aiBase=${AI_BASE}`);
  console.log(getHealth());
}
