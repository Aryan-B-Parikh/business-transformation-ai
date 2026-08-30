/**
 * AI Business Consultant — TASK-012
 * POST /ai/v1/consultant/validate-idea — feasibility check + best-practice recommendations
 * DoD: Unit tests over 3+ fixture scenarios (vague ideal → clarifying questions; solid idea → recommendations)
 */

import { localizeAiResponse } from "@bta/shared";

export interface ValidateIdeaRequest {
  idea: string;
  context?: { industry?: string; constraints?: string[] };
  lang?: string;
}

export type ValidateIdeaResponse =
  | { type: "clarifying_questions"; questions: string[]; reason: string }
  | { type: "recommendations"; feasibility: "high" | "medium" | "low"; recommendations: string[]; bestPractices: string[]; microsoftStack?: string[] };

export function validateIdea(req: ValidateIdeaRequest): ValidateIdeaResponse {
  const idea = (req.idea || "").trim();
  const lang = (req.lang as string) || "en";
  const localize = (text: string) => {
    if (!lang || lang === "en") return text;
    return localizeAiResponse(text, lang as never);
  };
  if (!idea || idea.length < 20) {
    return {
      type: "clarifying_questions",
      questions: [
        localize("Could you describe the business problem and desired outcome in more detail?"),
        localize("What is the target user and success metric?"),
        localize("Any constraints (budget, timeline, compliance)?"),
      ],
      reason: localize("Idea too vague ( <20 chars )"),
    };
  }

  const lower = idea.toLowerCase();
  const vagueIndicators = ["something", "idea", "thing", "maybe", "not sure"];
  const isVague = vagueIndicators.some((w) => lower.includes(w)) && idea.length < 80;
  if (isVague) {
    return {
      type: "clarifying_questions",
      questions: [
        localize("What specific problem does this solve?"),
        localize("Who benefits and how will you measure success?"),
        localize("What does the current process look like?"),
      ],
      reason: localize("Vague idea — missing specifics"),
    };
  }

  // Solid idea — check feasibility
  let feasibility: "high" | "medium" | "low" = "high";
  if (lower.includes("blockchain") && lower.includes("ai") && lower.includes("quantum")) feasibility = "low";
  else if (lower.includes("legacy") && lower.includes("migration")) feasibility = "medium";

  const recommendations: string[] = [];
  const bestPractices: string[] = ["Agile delivery", "MVP first", "Stakeholder alignment"].map(localize);
  const microsoftStack: string[] = [];

  if (lower.includes("automate") || lower.includes("manual")) {
    recommendations.push(localize("Implement RPA with Power Automate"));
    microsoftStack.push("Power Automate", "Logic Apps");
  }
  if (lower.includes("api") || lower.includes("integration")) {
    recommendations.push(localize("API-first design with Azure API Management"));
    microsoftStack.push("Azure API Management", "Azure Functions");
  }
  if (lower.includes("ai") || lower.includes("ml") || lower.includes("recommend")) {
    recommendations.push(localize("Leverage Azure OpenAI / Cognitive Services"));
    microsoftStack.push("Azure OpenAI", "Cognitive Services");
  }
  if (lower.includes("cloud") || lower.includes("migrate")) {
    recommendations.push(localize("Cloud migration phased approach"));
    microsoftStack.push("Azure Migrate", "Azure Kubernetes Service");
  }
  if (recommendations.length === 0) recommendations.push(localize("Phased build with buy-vs-build analysis"));
  if (lower.includes("dashboard") || lower.includes("report")) microsoftStack.push("Power BI");

  return {
    type: "recommendations",
    feasibility,
    recommendations,
    bestPractices,
    microsoftStack: microsoftStack.length ? microsoftStack : undefined,
  };
}
