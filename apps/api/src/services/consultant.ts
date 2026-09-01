/**
 * AI Business Consultant — TASK-012
 * POST /ai/v1/consultant/validate-idea — feasibility check + best-practice recommendations
 * DoD: Unit tests over 3+ fixture scenarios (vague ideal → clarifying questions; solid idea → recommendations)
 */

import { z } from "zod";
import { generateStructuredCompletion } from "../ai/llmProvider";
import { localizeAiResponse } from "@bta/shared";
import { getGroundingContext } from "./ragGrounding";

export const ConsultantLLMSchema = z.object({
  type: z.enum(["clarifying_questions", "recommendations"]),
  questions: z.array(z.string()).optional(),
  reason: z.string().optional(),
  feasibility: z.enum(["high", "medium", "low"]).optional(),
  recommendations: z.array(z.string()).optional(),
  bestPractices: z.array(z.string()).optional(),
  microsoftStack: z.array(z.string()).optional(),
});

function heuristic(req: ValidateIdeaRequest): ValidateIdeaResponse {
  const idea = (req.idea || "").trim();
  const lang = (req.lang as string) || "en";
  const localize = (t: string) => (!lang || lang === "en" ? t : localizeAiResponse(t, lang as never));
  if (!idea || idea.length < 20) return { type: "clarifying_questions", questions: [localize("Could you describe the business problem and desired outcome in more detail?"), localize("What is the target user and success metric?"), localize("Any constraints (budget, timeline, compliance)?")], reason: localize("Idea too vague ( <20 chars )") };
  const lower = idea.toLowerCase();
  const vagueIndicators = ["something", "idea", "thing", "maybe", "not sure"];
  const isVague = vagueIndicators.some((w) => lower.includes(w)) && idea.length < 80;
  if (isVague) return { type: "clarifying_questions", questions: [localize("What specific problem does this solve?"), localize("Who benefits and how will you measure success?"), localize("What does the current process look like?")], reason: localize("Vague idea — missing specifics") };
  let feasibility: "high" | "medium" | "low" = "high";
  if (lower.includes("blockchain") && lower.includes("ai") && lower.includes("quantum")) feasibility = "low";
  else if (lower.includes("legacy") && lower.includes("migration")) feasibility = "medium";
  const recs: string[] = []; const best: string[] = ["Agile delivery", "MVP first", "Stakeholder alignment"].map(localize); const stack: string[] = [];
  if (lower.includes("automate") || lower.includes("manual")) { recs.push(localize("Implement RPA with Power Automate")); stack.push("Power Automate", "Logic Apps"); }
  if (lower.includes("api") || lower.includes("integration")) { recs.push(localize("API-first design with Azure API Management")); stack.push("Azure API Management", "Azure Functions"); }
  if (lower.includes("ai") || lower.includes("ml") || lower.includes("recommend")) { recs.push(localize("Leverage Azure OpenAI / Cognitive Services")); stack.push("Azure OpenAI", "Cognitive Services"); }
  if (lower.includes("cloud") || lower.includes("migrate")) { recs.push(localize("Cloud migration phased approach")); stack.push("Azure Migrate", "Azure Kubernetes Service"); }
  if (recs.length === 0) recs.push(localize("Phased build with buy-vs-build analysis"));
  if (lower.includes("dashboard") || lower.includes("report")) stack.push("Power BI");
  return { type: "recommendations", feasibility, recommendations: recs, bestPractices: best, microsoftStack: stack.length ? stack : undefined };
}

export interface ValidateIdeaRequest {
  idea: string;
  context?: { industry?: string; constraints?: string[] };
  lang?: string;
}

export type ValidateIdeaResponse =
  | { type: "clarifying_questions"; questions: string[]; reason: string }
  | { type: "recommendations"; feasibility: "high" | "medium" | "low"; recommendations: string[]; bestPractices: string[]; microsoftStack?: string[] };

export function validateIdea(req: ValidateIdeaRequest): ValidateIdeaResponse { return heuristic(req); }

export async function validateIdeaLLM(req: ValidateIdeaRequest & { orgId?: string; projectId?: string }): Promise<ValidateIdeaResponse> {
  const hasLlmKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const allowLiveInTest = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) || process.env.FORCE_LIVE_LLM === "true";
  const useLLM = hasLlmKey && process.env.LLM_PROVIDER !== "mock" && (process.env.NODE_ENV !== "test" || allowLiveInTest);
  const isExplicitTestMockMode = process.env.NODE_ENV === "test" && !allowLiveInTest;
  if (!useLLM) {
    if (isExplicitTestMockMode) return heuristic(req);
    throw new Error("LLM provider unavailable and not in explicit test mock mode — refusing deterministic fallback");
  }
  let grounding = { contextBlock: "", citations: [] as unknown[] };
  if (req.orgId && (req as { projectId?: string }).projectId) {
    try { grounding = await getGroundingContext(req.orgId, (req as { projectId: string }).projectId, req.idea, 5); } catch { /* ignore */ }
  }
  try {
    const result = await generateStructuredCompletion(
      "You are an AI Business Consultant. Validate ideas, ask clarifying questions when vague (<80 chars or vague words), otherwise give feasibility high/medium/low, recommendations, best practices, and Microsoft stack (Power Automate/Azure). Return structured JSON only. Use user's lang for text. Use RAG context if provided.",
      `Idea: ${req.idea}\nContext: ${JSON.stringify(req.context || {})}\nLang: ${req.lang || "en"}${grounding.contextBlock}`,
      ConsultantLLMSchema,
      { model: "gpt-4o-mini", orgId: req.orgId }
    );
    // Normalize to union type
    if (result.type === "clarifying_questions") return { type: "clarifying_questions", questions: result.questions || [], reason: result.reason || "Needs clarification" };
    return { type: "recommendations", feasibility: (result.feasibility as "high"|"medium"|"low") || "high", recommendations: result.recommendations || [], bestPractices: result.bestPractices || [], microsoftStack: result.microsoftStack };
  } catch (e) {
    if (isExplicitTestMockMode) return heuristic(req);
    throw new Error(`LLM provider failed for consultant: ${(e as Error).message}`);
  }
}
