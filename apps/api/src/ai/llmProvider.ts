import { z } from "zod";
import { buildSystemPrompt } from "./prompts";
import { detectPromptInjection, detectSSRFInInput, AIValidationError } from "./guardrails";
import { recordAITelemetry } from "../utils/telemetry";

export interface LLMConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLMTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMTimeoutError";
  }
}

/**
 * A unified LLM provider that wraps external AI calls (e.g., OpenAI).
 * Integrates Phase 7 Guardrails and Phase 9 Zod Validation.
 */
export async function generateStructuredCompletion<T>(
  systemInstruction: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  config: LLMConfig = {}
): Promise<T> {
  // 1. Guardrails (Phase 7.3)
  detectPromptInjection(userPrompt);
  detectSSRFInInput(userPrompt);

  // 2. Strict Prompting (Phase 7.2)
  const systemPrompt = buildSystemPrompt(systemInstruction, schema);

  // 3. Network Call (Simulated for tests/isolation, easily swappable for real fetch)
  const startTime = Date.now();
  const rawResponse = await invokeLLM(systemPrompt, userPrompt, config);
  const latencyMs = Date.now() - startTime;

  // Record Telemetry (Phase 9)
  const promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  const completionTokens = Math.ceil(rawResponse.length / 4);
  const totalTokens = promptTokens + completionTokens;
  const model = config.model || "gpt-4o-mini";
  const costPer1kPrompt = model.includes("gpt-4o-mini") ? 0.00015 : 0.005;
  const costPer1kCompletion = model.includes("gpt-4o-mini") ? 0.0006 : 0.015;
  const cost = (promptTokens / 1000) * costPer1kPrompt + (completionTokens / 1000) * costPer1kCompletion;
  
  recordAITelemetry({
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs,
    cost
  });

  // 4. Schema Validation (Phase 9)
  try {
    const parsedJson = JSON.parse(rawResponse);
    return schema.parse(parsedJson);
  } catch (err: any) {
    // Phase 9 Repair Loop logic could go here (e.g. asking LLM to fix its own JSON)
    throw new AIValidationError(`Failed to validate LLM output against schema: ${err.message}`);
  }
}

/**
 * Isolated fetch wrapper to be mocked in tests or replaced with real OpenAI SDK.
 */
async function invokeLLM(systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<string> {
  const model = config.model || "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "test") {
      throw new Error("Missing mock implementation for invokeLLM in tests.");
    }
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  // 5. Real LLM invocation
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? 2000,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM Invocation failed: ${response.status} ${errText}`);
  }

  const data = await response.json() as { choices: Array<{ message?: { content?: string } }> };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("No content returned from LLM");
  return content;
}
