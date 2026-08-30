/**
 * TASK-012 — AI Business Consultant
 * DoD: Unit tests over 3+ fixture scenarios (vague idea → clarifying questions; solid idea → recommendations)
 */

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { validateIdea } from "../src/services/consultant";

const app = createApp();
const plain = getSeedPlainPassword();

async function token(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-012: AI Business Consultant — unit (validateIdea)", () => {
  it("Scenario 1: vague idea (<20 chars) → clarifying questions", () => {
    const res = validateIdea({ idea: "idea" });
    expect(res.type).toBe("clarifying_questions");
    if (res.type === "clarifying_questions") {
      expect(res.questions.length).toBeGreaterThanOrEqual(3);
      expect(res.reason).toMatch(/vague/i);
    }
  });

  it("Scenario 2: vague with filler words and short length → clarifying questions", () => {
    const res = validateIdea({ idea: "I have something maybe for automation" });
    expect(res.type).toBe("clarifying_questions");
  });

  it("Scenario 3: solid idea about automation → recommendations with feasibility high", () => {
    const idea = "We want to automate order-to-cash: capture orders via API, validate payments with AI fraud detection, generate invoices automatically, and integrate with S3 storage. Need cloud migration.";
    const res = validateIdea({ idea });
    expect(res.type).toBe("recommendations");
    if (res.type === "recommendations") {
      expect(["high", "medium", "low"]).toContain(res.feasibility);
      expect(res.recommendations.length).toBeGreaterThan(0);
      expect(res.bestPractices.length).toBeGreaterThan(0);
      // Should mention Power Automate and Azure OpenAI for AI
      expect(res.recommendations.join(" ").toLowerCase()).toMatch(/automate|api|ai/);
      expect(res.microsoftStack).toBeDefined();
    }
  });

  it("Scenario 4: solid idea about dashboard → Power BI", () => {
    const res = validateIdea({ idea: "Build a dashboard for sales reporting with real-time KPIs and Power BI integration for transformation tracking." });
    expect(res.type).toBe("recommendations");
    if (res.type === "recommendations") expect(res.microsoftStack?.join(" ")).toMatch(/Power BI/);
  });

  it("Scenario 5: over-ambitious low feasibility → still returns recommendations but low", () => {
    const res = validateIdea({ idea: "We want to build a blockchain + AI + quantum powered platform for everything with legacy migration and cloud." });
    expect(res.type).toBe("recommendations");
    if (res.type === "recommendations") expect(res.feasibility).toBe("low");
  });
});

describe("TASK-012: AI Business Consultant via API", () => {
  it("POST /api/v1/ai/v1/consultant/validate-idea — vague → questions", async () => {
    const t = await token();
    const res = await request(app).post("/api/v1/ai/v1/consultant/validate-idea").set("Authorization", `Bearer ${t}`).send({ idea: "thing" });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("clarifying_questions");
    expect(res.body.questions).toBeDefined();
  });

  it("POST /api/v1/ai/v1/consultant/validate-idea — solid → recommendations", async () => {
    const t = await token();
    const idea = "Automate manual invoice process via API integration and Power Automate, with AI for fraud detection and cloud migration to Azure.";
    const res = await request(app).post("/api/v1/ai/v1/consultant/validate-idea").set("Authorization", `Bearer ${t}`).send({ idea });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("recommendations");
    expect(res.body.recommendations).toBeDefined();
    expect(res.body.feasibility).toBeDefined();
  });

  it("POST — missing idea → 400", async () => {
    const t = await token();
    const res = await request(app).post("/api/v1/ai/v1/consultant/validate-idea").set("Authorization", `Bearer ${t}`).send({});
    expect(res.status).toBe(400);
  });

  it("Requires auth → 401", async () => {
    const res = await request(app).post("/api/v1/ai/v1/consultant/validate-idea").send({ idea: "test idea that is long enough to be solid" });
    expect(res.status).toBe(401);
  });
});
