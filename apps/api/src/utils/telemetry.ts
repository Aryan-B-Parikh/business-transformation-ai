export interface TelemetryMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  cost: number;
  model: string;
}

export function recordAITelemetry(metrics: TelemetryMetrics, context?: { orgId?: string; correlationId?: string; projectId?: string }) {
  // In a real application, this would send metrics to Datadog/Prometheus or save to a DB
  console.log(`[TELEMETRY] AI Engine Call - Model: ${metrics.model}, Latency: ${metrics.latencyMs}ms, Tokens: ${metrics.totalTokens} (P:${metrics.promptTokens} C:${metrics.completionTokens}), Cost: $${metrics.cost.toFixed(4)}`, context || {});
}
