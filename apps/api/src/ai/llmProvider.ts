import { z } from "zod";
import { recordAITelemetry } from "../utils/telemetry";
import { detectPromptInjection, detectSSRFInInput, AIValidationError } from "./guardrails";
import { buildSystemPrompt } from "./prompts";

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export interface LLMConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  orgId?: string;
  orgPlan?: "trial" | "standard" | "enterprise";
}
export class LLMTimeoutError extends Error { constructor(message: string) { super(message); this.name = "LLMTimeoutError"; } }
type Invocation = { content: string; promptTokens?: number; completionTokens?: number };

const orgUsage = new Map<string, number>();

export function getOrgUsage(orgId: string): number {
  return orgUsage.get(orgId) || 0;
}

export function resetOrgUsage(): void {
  orgUsage.clear();
}

export function checkAndIncrementQuota(orgId?: string, orgPlan?: string, tokens: number = 0): void {
  if (!orgId) return;
  const current = orgUsage.get(orgId) || 0;
  const plan = orgPlan || "enterprise";
  const limit = plan === "trial" ? 100_000 : plan === "standard" ? 1_000_000 : Infinity;
  if (current + tokens > limit) {
    throw new QuotaExceededError(`Organization quota exceeded for plan ${plan}. Current usage: ${current}, requested: ${tokens}, limit: ${limit}`);
  }
  orgUsage.set(orgId, current + tokens);
}

import { prisma as appPrisma } from "../db/client";

export async function recordDurableUsage(orgId: string, model: string, promptTokens: number, completionTokens: number, cost: number, requestId?: string): Promise<void> {
  const totalTokens = promptTokens + completionTokens;
  orgUsage.set(orgId, (orgUsage.get(orgId) || 0) + totalTokens);
  if (process.env.DATABASE_URL && (appPrisma as any)?.aiUsageLog) {
    try {
      await (appPrisma as any).aiUsageLog.create({
        data: {
          orgId,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          cost,
          requestId
        }
      });
    } catch {
      // Non-blocking fallback
    }
  }
}

export async function generateStructuredCompletion<T>(systemInstruction: string, userPrompt: string, schema: z.ZodType<T>, config: LLMConfig = {}): Promise<T> {
  detectPromptInjection(userPrompt); detectSSRFInInput(userPrompt);
  checkAndIncrementQuota(config.orgId, config.orgPlan, 500);
  const systemPrompt = buildSystemPrompt(systemInstruction, schema);
  const start = Date.now();
  let invocation = await Internal.invokeLLM(systemPrompt, userPrompt, config);
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const value = schema.parse(JSON.parse(invocation.content));
      const promptTokens = invocation.promptTokens ?? Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const completionTokens = invocation.completionTokens ?? Math.ceil(invocation.content.length / 4);
      const model = config.model || "gpt-4o-mini";
      const inputPrice = model.includes("gpt-4o-mini") ? 0.00015 : 0.005;
      const outputPrice = model.includes("gpt-4o-mini") ? 0.0006 : 0.015;
      const cost = (promptTokens / 1000) * inputPrice + (completionTokens / 1000) * outputPrice;
      recordAITelemetry({ model, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, latencyMs: Date.now() - start, cost });
      if (config.orgId) {
        void recordDurableUsage(config.orgId, model, promptTokens, completionTokens, cost);
      }
      return value;
    } catch (err) {
      lastError = err;
      if (attempt === 2) break;
      const repairPrompt = `Return ONLY valid JSON matching the required schema. Repair the following invalid model output. Do not add commentary. Validation error: ${String((err as Error)?.message || err)}\nINVALID OUTPUT:\n${invocation.content}`;
      invocation = await Internal.invokeLLM(systemPrompt, repairPrompt, { ...config, temperature: 0 });
    }
  }
  throw new AIValidationError(`Failed to validate LLM output after bounded repair attempts: ${String((lastError as Error)?.message || lastError)}`);
}

export const Internal = {
  async invokeLLM(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<Invocation> {
  const model = config.model || "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "test") {
      throw new Error("Missing mock implementation for invokeLLM in tests.");
    }
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 30000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: config.temperature ?? 0.2, max_tokens: config.maxTokens ?? 2000, response_format: { type: "json_object" } }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`LLM Invocation failed: ${response.status} ${await response.text()}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content returned from LLM");
    return { content, promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new LLMTimeoutError(`LLM request timed out after ${config.timeoutMs ?? 30000}ms`);
    throw err;
  } finally { clearTimeout(timeout); }
}
};
