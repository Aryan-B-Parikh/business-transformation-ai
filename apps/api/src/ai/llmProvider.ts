import { z } from "zod";
import { buildSystemPrompt } from "./prompts";
import { detectPromptInjection, detectSSRFInInput, AIValidationError } from "./guardrails";
import { recordAITelemetry } from "../utils/telemetry";

export interface LLMConfig { model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number; }
export class LLMTimeoutError extends Error { constructor(message: string) { super(message); this.name = "LLMTimeoutError"; } }
type Invocation = { content: string; promptTokens?: number; completionTokens?: number };

export async function generateStructuredCompletion<T>(systemInstruction: string, userPrompt: string, schema: z.ZodType<T>, config: LLMConfig = {}): Promise<T> {
  detectPromptInjection(userPrompt); detectSSRFInInput(userPrompt);
  const systemPrompt = buildSystemPrompt(systemInstruction, schema);
  const start = Date.now();
  let invocation = await invokeLLM(systemPrompt, userPrompt, config);
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const value = schema.parse(JSON.parse(invocation.content));
      const promptTokens = invocation.promptTokens ?? Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const completionTokens = invocation.completionTokens ?? Math.ceil(invocation.content.length / 4);
      const model = config.model || "gpt-4o-mini";
      const inputPrice = model.includes("gpt-4o-mini") ? 0.00015 : 0.005;
      const outputPrice = model.includes("gpt-4o-mini") ? 0.0006 : 0.015;
      recordAITelemetry({ model, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, latencyMs: Date.now() - start, cost: (promptTokens / 1000) * inputPrice + (completionTokens / 1000) * outputPrice });
      return value;
    } catch (err) {
      lastError = err;
      if (attempt === 2) break;
      const repairPrompt = `Return ONLY valid JSON matching the required schema. Repair the following invalid model output. Do not add commentary. Validation error: ${String((err as Error)?.message || err)}\nINVALID OUTPUT:\n${invocation.content}`;
      invocation = await invokeLLM(systemPrompt, repairPrompt, { ...config, temperature: 0 });
    }
  }
  throw new AIValidationError(`Failed to validate LLM output after bounded repair attempts: ${String((lastError as Error)?.message || lastError)}`);
}

async function invokeLLM(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<Invocation> {
  const model = config.model || "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 30000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: config.temperature ?? 0.2, max_tokens: config.maxTokens ?? 2000, response_format: { type: "json_object" } }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`LLM Invocation failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content returned from LLM");
    return { content, promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new LLMTimeoutError(`LLM request timed out after ${config.timeoutMs ?? 30000}ms`);
    throw err;
  } finally { clearTimeout(timeout); }
}
