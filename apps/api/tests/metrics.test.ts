import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../src/app";

const app = createApp();

describe("Metrics — observability", () => {
  it("GET /metrics returns Prometheus text", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("process_uptime_seconds");
  });

  it("records ai telemetry on next request", async () => {
    await request(app).get("/health");
    const res = await request(app).get("/metrics");
    expect(res.text).toContain("http_requests_total");
  });
});
