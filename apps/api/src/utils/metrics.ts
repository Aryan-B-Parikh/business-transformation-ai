/**
 * Minimal Prometheus-style metrics for observability (AUDIT §29)
 * Tracks request latency, AI tokens/cost, DB timings via in-memory counters.
 * Exposed at GET /metrics (not versioned, scraped by Prometheus).
 */

const counters = new Map<string, number>();
const histograms = new Map<string, number[]>();

export function incCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
  const key = `${name}{${Object.entries(labels).map(([k,v])=>`${k}="${v}"`).join(",")}}`;
  counters.set(key, (counters.get(key) || 0) + value);
}

export function observeHistogram(name: string, value: number): void {
  const arr = histograms.get(name) || [];
  arr.push(value);
  if (arr.length > 1000) arr.shift();
  histograms.set(name, arr);
}

function p95(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length * 0.95)] || 0;
}

export function renderMetrics(): string {
  const lines: string[] = [];
  for (const [k, v] of counters.entries()) lines.push(`${k} ${v}`);
  for (const [k, arr] of histograms.entries()) lines.push(`${k}_p95 ${p95(arr)}`);
  lines.push(`process_uptime_seconds ${process.uptime()}`);
  return lines.join("\n") + "\n";
}

export function metricsMiddleware(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const dur = Date.now() - start;
    observeHistogram("http_request_duration_ms", dur);
    incCounter("http_requests_total", { method: (req as { method: string }).method, path: req.path, status: String(res.statusCode) });
  });
  next();
}
