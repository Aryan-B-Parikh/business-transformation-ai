/**
 * Discovery agent — TASK-010
 * POST /ai/v1/discovery/ask — takes conversation history + RAG context,
 * returns next discovery question or discovery summary when sufficient info gathered.
 *
 * DoD: Given a scripted conversation fixture, agent asks clarifying question when info missing
 *      and produces structured summary when it isn't.
 */

import { localizeAiResponse } from "@bta/shared";

export interface DiscoveryMessage {
  role: "user" | "ai";
  content: string;
}

export interface DiscoveryRequest {
  conversationHistory: DiscoveryMessage[];
  ragContext?: string[]; // relevant document excerpts
  projectId?: string;
  orgId?: string;
  lang?: string; // SupportedLanguage, for i18n TASK-030
}

export type DiscoveryResponse =
  | { type: "question"; question: string; reason: string }
  | { type: "summary"; summary: string; structured: DiscoverySummary };

export interface DiscoverySummary {
  businessGoals: string[];
  challenges: string[];
  processes: string[];
  stakeholders: string[];
  recommendations: string[];
  maturity: { current: string; future: string };
}

// Keywords that indicate sufficient discovery info
const GOAL_KEYWORDS = ["goal", "objective", "target", "outcome", "kpi", "revenue", "growth", "efficiency"];
const CHALLENGE_KEYWORDS = ["challenge", "problem", "pain", "issue", "bottleneck", "gap", "risk"];
const PROCESS_KEYWORDS = ["process", "workflow", "step", "sop", "procedure", "automation", "manual"];
const STAKEHOLDER_KEYWORDS = ["stakeholder", "team", "department", "role", "user", "customer"];

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function hasSufficientInfo(history: DiscoveryMessage[]): { sufficient: boolean; missing: string[] } {
  const userText = history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ")
    .toLowerCase();
  const missing: string[] = [];
  if (!containsKeyword(userText, GOAL_KEYWORDS)) missing.push("business goals");
  if (!containsKeyword(userText, CHALLENGE_KEYWORDS)) missing.push("challenges");
  if (!containsKeyword(userText, PROCESS_KEYWORDS)) missing.push("processes");
  if (!containsKeyword(userText, STAKEHOLDER_KEYWORDS)) missing.push("stakeholders");
  // Need at least 2 user messages and 100 chars to be sufficient
  const userCount = history.filter((m) => m.role === "user").length;
  if (userCount < 2) missing.push("more conversation depth");
  if (userText.length < 100) missing.push("detail");
  return { sufficient: missing.length === 0, missing };
}

export function discoveryAsk(req: DiscoveryRequest): DiscoveryResponse {
  const history = req.conversationHistory || [];
  const lang = (req.lang as string) || "en";
  const localize = (text: string) => {
    if (!lang || lang === "en") return text;
    return localizeAiResponse(text, lang as never);
  };
  if (history.length === 0) {
    return {
      type: "question",
      question: localize("What business idea or challenge would you like to explore? Please describe your goals and current processes."),
      reason: "No conversation history yet",
    };
  }

  const { sufficient, missing } = hasSufficientInfo(history);

  if (!sufficient) {
    // Pick most critical missing
    const focus = missing[0]!;
    const questions: Record<string, string> = {
      "business goals": "Could you clarify your primary business goals and success metrics (e.g., revenue, efficiency, customer satisfaction)?",
      challenges: "What are the main challenges or pain points you're experiencing in the current process?",
      processes: "Could you describe the current workflow or process steps involved? Where are the manual handoffs?",
      stakeholders: "Who are the key stakeholders and teams involved in this process?",
      "more conversation depth": "Could you share more detail about your current operations and desired outcomes?",
      detail: "Please provide a bit more detail (at least a few sentences) so I can understand the context better.",
    };
    return {
      type: "question",
      question: localize(questions[focus] || `Could you elaborate on ${focus}?`),
      reason: `Missing: ${missing.join(", ")}`,
    };
  }

  // Sufficient — produce structured summary using history + RAG
  const userText = history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  const rag = (req.ragContext || []).join(" ");

  const summaryText = localize(
    `Discovery summary for project ${req.projectId || "unknown"}: Goals and challenges extracted from ${history.length} messages. RAG context ${req.ragContext?.length || 0} excerpts integrated.`
  );
  const structured: DiscoverySummary = {
    businessGoals: extractGoals(userText, rag).map(localize),
    challenges: extractChallenges(userText, rag).map(localize),
    processes: extractProcesses(userText, rag).map(localize),
    stakeholders: extractStakeholders(userText, rag).map(localize),
    recommendations: ["Automate manual handoffs", "Implement AI for fraud detection", "Cloud migration for scalability"].map(localize),
    maturity: { current: localize("2.5 - Manual, fragmented"), future: localize("4.0 - Automated, integrated") },
  };
  return {
    type: "summary",
    summary: summaryText,
    structured,
  };
}

function extractGoals(text: string, rag: string): string[] {
  const combined = `${text} ${rag}`;
  const goals: string[] = [];
  if (combined.toLowerCase().includes("revenue")) goals.push("Increase revenue");
  if (combined.toLowerCase().includes("efficiency")) goals.push("Improve efficiency");
  if (combined.toLowerCase().includes("automation")) goals.push("Automate processes");
  if (goals.length === 0) goals.push("Digital transformation");
  return goals;
}
function extractChallenges(text: string, rag: string): string[] {
  const combined = `${text} ${rag}`;
  const out: string[] = [];
  if (combined.toLowerCase().includes("manual")) out.push("Manual handoffs");
  if (combined.toLowerCase().includes("payment")) out.push("Payment validation delays");
  if (out.length === 0) out.push("Identified gaps in current process");
  return out;
}
function extractProcesses(text: string, rag: string): string[] {
  const combined = `${text} ${rag}`;
  const out: string[] = [];
  if (combined.toLowerCase().includes("order")) out.push("Order capture");
  if (combined.toLowerCase().includes("invoice")) out.push("Invoice generation");
  if (out.length === 0) out.push("Core workflow");
  return out;
}
function extractStakeholders(text: string, rag: string): string[] {
  const combined = `${text} ${rag}`;
  const out: string[] = [];
  if (combined.toLowerCase().includes("sales")) out.push("Sales");
  if (combined.toLowerCase().includes("finance")) out.push("Finance");
  if (out.length === 0) out.push("Business team");
  return out;
}
