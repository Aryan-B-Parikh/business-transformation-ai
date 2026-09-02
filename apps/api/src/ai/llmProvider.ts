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
  requestId?: string;
}
export class LLMTimeoutError extends Error { constructor(message: string) { super(message); this.name = "LLMTimeoutError"; } }
type Invocation = { content: string; promptTokens?: number; completionTokens?: number };

// Fallback Map only when DATABASE_URL is not set (unit tests without DB). Production uses PostgreSQL as source of truth.
const orgUsageFallback = new Map<string, number>();

export async function getOrgUsage(orgId: string): Promise<number> {
  if (process.env.DATABASE_URL) {
    try {
      const { prisma: p } = await import("../db/client");
      const rows = await (p as any).$queryRawUnsafe('SELECT COALESCE(SUM("total_tokens"),0)::int as sum FROM "ai_usage_logs" WHERE "org_id" = $1 AND "created_at" >= date_trunc(\'month\', now())', orgId) as Array<{ sum: number }>;
      return Number(rows[0]?.sum || 0);
    } catch (e) {
      if (process.env.NODE_ENV === "production") throw new Error(`Failed to fetch org usage (PostgreSQL authoritative): ${(e as Error).message}`);
      return orgUsageFallback.get(orgId) || 0;
    }
  }
  return orgUsageFallback.get(orgId) || 0;
}

export function resetOrgUsage(): void {
  orgUsageFallback.clear();
}

function getPlanLimit(plan?: string): number {
  const p = plan || "enterprise";
  if (p === "trial") return 100_000;
  if (p === "standard") return 1_000_000;
  return Infinity;
}

export async function checkAndIncrementQuota(orgId?: string, orgPlan?: string, tokens: number = 0, requestId?: string): Promise<void> {
  if (!orgId) return;
  const limit = getPlanLimit(orgPlan);
  if (limit === Infinity) return;
  // Idempotent: if requestId already recorded, do not double-count
  if (requestId && process.env.DATABASE_URL) {
    try {
      const { prisma: p } = await import("../db/client");
      const existing = await (p as any).$queryRawUnsafe('SELECT 1 FROM "ai_usage_logs" WHERE "org_id" = $1 AND "request_id" = $2 LIMIT 1', orgId, requestId) as unknown[];
      if (Array.isArray(existing) && existing.length > 0) return;
    } catch {
      // fall through to normal check
    }
  }
  if (process.env.DATABASE_URL) {
    const { prisma: p } = await import("../db/client");
    // Serialize quota decision per org via advisory lock to prevent concurrent exceed
    await (p as any).$transaction(async (tx: { $executeRawUnsafe: (q: string, ...a: unknown[]) => Promise<unknown>; $queryRawUnsafe: (q: string, ...a: unknown[]) => Promise<unknown[]> }) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', orgId);
      const rows = await tx.$queryRawUnsafe('SELECT COALESCE(SUM("total_tokens"),0)::int as sum FROM "ai_usage_logs" WHERE "org_id" = $1 AND "created_at" >= date_trunc(\'month\', now())', orgId) as Array<{ sum: number }>;
      const current = Number(rows[0]?.sum || 0);
      if (current + tokens > limit) {
        throw new QuotaExceededError(`Organization quota exceeded for plan ${orgPlan || "enterprise"}. Current monthly usage: ${current}, requested: ${tokens}, limit: ${limit}, billing period: ${new Date().toISOString().slice(0,7)}`);
      }
    });
    return;
  }
  // Fallback Map for unit tests without DB
  const current = orgUsageFallback.get(orgId) || 0;
  if (current + tokens > limit) {
    throw new QuotaExceededError(`Organization quota exceeded for plan ${orgPlan || "enterprise"}. Current usage: ${current}, requested: ${tokens}, limit: ${limit}`);
  }
  orgUsageFallback.set(orgId, current + tokens);
}

import { prisma as appPrisma } from "../db/client";

export async function recordDurableUsage(orgId: string, model: string, promptTokens: number, completionTokens: number, cost: number, requestId?: string, orgPlan?: string): Promise<void> {
  if (!orgId) throw new Error("orgId required for usage persistence");
  if (!requestId) throw new Error("requestId required for idempotent usage persistence (billing period: " + new Date().toISOString().slice(0,7) + ")");
  const totalTokens = promptTokens + completionTokens;
  const pricingVersion = "2026-01";
  if (!process.env.DATABASE_URL) {
    // Test fallback — still track in Map for unit tests
    orgUsageFallback.set(orgId, (orgUsageFallback.get(orgId) || 0) + totalTokens);
    return;
  }
  // Authoritative single transaction: lock, idempotency, quota check, insert with pricingVersion
  const limit = getPlanLimit(orgPlan);
  try {
    await (appPrisma as unknown as { $transaction: (fn: (tx: unknown) => Promise<void>) => Promise<void> }).$transaction(async (tx: unknown) => {
      const p = tx as unknown as { $executeRawUnsafe: (q: string, ...a: unknown[]) => Promise<unknown>; $queryRawUnsafe: (q: string, ...a: unknown[]) => Promise<unknown[]>; aiUsageLog: { create: (o: unknown) => Promise<unknown> } };
      await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', orgId);
      const existing = await p.$queryRawUnsafe('SELECT 1 FROM "ai_usage_logs" WHERE "org_id" = $1 AND "request_id" = $2 LIMIT 1', orgId, requestId) as unknown[];
      if (Array.isArray(existing) && existing.length > 0) return;
      if (limit !== Infinity) {
        const rows = await p.$queryRawUnsafe('SELECT COALESCE(SUM("total_tokens"),0)::int as sum FROM "ai_usage_logs" WHERE "org_id" = $1 AND "created_at" >= date_trunc(\'month\', now())', orgId) as Array<{ sum: number }>;
        const current = Number(rows[0]?.sum || 0);
        if (current + totalTokens > limit) {
          throw new QuotaExceededError(`Organization quota exceeded for plan ${orgPlan || "enterprise"}. Current monthly usage: ${current}, requested: ${totalTokens}, limit: ${limit}, billing period: ${new Date().toISOString().slice(0,7)}, pricingVersion: ${pricingVersion}`);
        }
      }
      await p.aiUsageLog.create({
        data: {
          orgId,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          cost,
          requestId,
          pricingVersion
        }
      });
    });
  } catch (e) {
    if (e instanceof QuotaExceededError) throw e;
    throw new Error(`Failed to persist AI usage: ${(e as Error).message}`);
  }
  // Also update fallback for in-memory readers (not authoritative)
  orgUsageFallback.set(orgId, (orgUsageFallback.get(orgId) || 0) + totalTokens);
}

export async function generateStructuredCompletion<T>(systemInstruction: string, userPrompt: string, schema: z.ZodType<T>, config: LLMConfig & { requestId?: string } = {}): Promise<T> {
  detectPromptInjection(userPrompt); detectSSRFInInput(userPrompt);
  const requestId = (config as { requestId?: string }).requestId || (await import("crypto")).randomUUID();
  await checkAndIncrementQuota(config.orgId, config.orgPlan, 500, requestId);
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
        await recordDurableUsage(config.orgId, model, promptTokens, completionTokens, cost, requestId, config.orgPlan);
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

function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
function getGeminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}
function normalizeGeminiModel(model: string): string {
  if (!model || model.includes("gpt")) return "gemini-3.6-flash";
  if (model === "gemini-3.7-flash" || model === "gemini-3.7" || model.includes("3.7")) return "gemini-3.6-flash";
  if (model === "gemini-2.5-flash" || model.includes("2.5")) return "gemini-3.6-flash";
  if (model.startsWith("gemini-")) return model;
  return "gemini-3.6-flash";
}
async function invokeGemini(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<Invocation> {
  const apiKey = getGeminiKey()!;
  const model = normalizeGeminiModel(config.model || "gemini-1.5-flash");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 30000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
    const combinedPrompt = `${systemPrompt}\n\n---\nUser:\n${userPrompt}\n\nReturn ONLY valid JSON per schema, no markdown.`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
        generationConfig: { temperature: config.temperature ?? 0.2, maxOutputTokens: config.maxTokens ?? 2000, responseMimeType: "application/json" }
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Gemini invocation failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No content returned from Gemini");
    // Strip markdown fences if present
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return { content: cleaned, promptTokens: data.usageMetadata?.promptTokenCount, completionTokens: data.usageMetadata?.candidatesTokenCount };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new LLMTimeoutError(`Gemini request timed out after ${config.timeoutMs ?? 30000}ms`);
    throw err;
  } finally { clearTimeout(timeout); }
}

export const Internal = {
  async invokeLLM(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<Invocation> {
  const geminiKey = getGeminiKey();
  const openAiKey = process.env.OPENAI_API_KEY;
  const provider = (process.env.LLM_PROVIDER || (geminiKey ? "gemini" : openAiKey ? "openai" : "")).toLowerCase();
  if (provider === "gemini" || (geminiKey && !openAiKey)) {
    if (!geminiKey) {
      if (process.env.NODE_ENV === "test") throw new Error("Missing mock implementation for invokeLLM in tests.");
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    return invokeGemini(systemPrompt, userPrompt, config);
  }
  const model = config.model || "gpt-4o-mini";
  const apiKey = openAiKey;
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
