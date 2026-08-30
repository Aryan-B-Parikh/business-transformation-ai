/**
 * TASK-032 — Load testing & performance tuning
 * Simulated concurrent load for p95 targets (02 §6)
 */

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";

const app = createApp();
const plain = getSeedPlainPassword();

describe("TASK-032: Load", () => {
  it("10 concurrent discovery Q&A <5s p95", async () => {
    const token = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain })).body.token;
    const start = Date.now();
    const times: number[] = [];
    const promises = Array.from({ length: 10 }, async () => {
      const s = Date.now();
      const res = await request(app).post("/api/v1/ai/v1/discovery/ask").set("Authorization", `Bearer ${token}`).send({ conversationHistory: [{ role: "user", content: "Goal: automate" }] });
      times.push(Date.now() - s);
      expect(res.status).toBe(200);
    });
    await Promise.all(promises);
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    expect(p95).toBeLessThan(5000); // 5s target
    expect(Date.now() - start).toBeLessThan(10000);
  });

  it("Diagram rendering p95 <500ms for 10 concurrent", async () => {
    const token = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain })).body.token;
    const spec = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] };
    const times: number[] = [];
    const promises = Array.from({ length: 10 }, async () => {
      const s = Date.now();
      const res = await request(app).post("/api/v1/ai/v1/diagram/render").set("Authorization", `Bearer ${token}`).send({ diagramSpec: spec });
      times.push(Date.now() - s);
      expect(res.status).toBe(200);
    });
    await Promise.all(promises);
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    expect(p95).toBeLessThan(500);
  });
});
