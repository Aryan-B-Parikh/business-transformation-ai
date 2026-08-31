export interface TelemetryMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  cost: number;
  model: string;
}

import { incCounter, observeHistogram } from "./metrics";

export function recordAITelemetry(metrics: TelemetryMetrics, context?: { orgId?: string; correlationId?: string; projectId?: string }) {
  incCounter("ai_requests_total", { model: metrics.model });
  incCounter("ai_tokens_total", { model: metrics.model }, metrics.totalTokens);
  incCounter("ai_cost_total", { model: metrics.model }, Math.round(metrics.cost * 1e6));
  observeHistogram("ai_latency_ms", metrics.latencyMs);
  console.log(`[TELEMETRY] AI Engine Call - Model: ${metrics.model}, Latency: ${metrics.latencyMs}ms, Tokens: ${metrics.totalTokens} (P:${metrics.promptTokens} C:${metrics.completionTokens}), Cost: $${metrics.cost.toFixed(4)}`, context || {});
}
