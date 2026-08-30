/**
 * TASK-010 — Discovery agent
 * DoD: Given scripted conversation fixture, agent asks clarifying question when info missing
 *      and produces structured summary when it isn't.
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { discoveryAsk } from "../src/services/discoveryAgent";
import { clearChunks } from "../src/services/documentParser";
import { clearStorage } from "../src/services/storage";
import { clearConversations } from "../src/stores/conversations";
import { clearDocuments } from "../src/stores/documents";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-010: Discovery agent (unit)", () => {
  it("asks clarifying question when info missing (vague idea)", () => {
    const history = [{ role: "user" as const, content: "I have an idea for something." }];
    const result = discoveryAsk({ conversationHistory: history });
    expect(result.type).toBe("question");
    if (result.type === "question") {
      expect(result.question.length).toBeGreaterThan(10);
      expect(result.reason).toMatch(/Missing/);
    }
  });

  it("asks clarifying question when only one user message", () => {
    const history = [{ role: "user" as const, content: "We want to improve." }];
    const result = discoveryAsk({ conversationHistory: history });
    expect(result.type).toBe("question");
  });

  it("produces structured summary when sufficient info gathered", () => {
    const history = [
      { role: "user" as const, content: "Our goal is to increase revenue and improve efficiency via automation." },
      { role: "ai" as const, content: "What challenges are you facing?" },
      { role: "user" as const, content: "Challenges: manual payment validation, bottleneck in order capture. Processes: order capture, payment, invoice. Stakeholders: Sales, Finance, IT. We have SOP docs." },
    ];
    const result = discoveryAsk({ conversationHistory: history, projectId: "proj-1", orgId: "org-1", ragContext: ["SOP content"] });
    expect(result.type).toBe("summary");
    if (result.type === "summary") {
      expect(result.summary).toBeDefined();
      expect(result.structured.businessGoals.length).toBeGreaterThan(0);
      expect(result.structured.challenges.length).toBeGreaterThan(0);
      expect(result.structured.processes.length).toBeGreaterThan(0);
      expect(result.structured.stakeholders.length).toBeGreaterThan(0);
      expect(result.structured.maturity.current).toBeDefined();
    }
  });

  it("handles empty history → asks initial question", () => {
    const result = discoveryAsk({ conversationHistory: [] });
    expect(result.type).toBe("question");
  });
});

describe("TASK-010: Discovery agent via API (POST /ai/v1/discovery/ask)", () => {
  let token: string;

  beforeEach(async () => {
    clearConversations();
    clearDocuments();
    clearChunks();
    clearStorage();
    clearWorkspaces();
    token = await login();
  });

  it("POST /api/v1/ai/v1/discovery/ask — vague history → question", async () => {
    const res = await request(app).post("/api/v1/ai/v1/discovery/ask").set("Authorization", `Bearer ${token}`).send({ conversationHistory: [{ role: "user", content: "idea" }] });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("question");
    expect(res.body.question).toBeDefined();
  });

  it("POST /ai/v1/discovery/ask (internal) — sufficient history → summary", async () => {
    const history = [
      { role: "user", content: "Goal: automate order to cash, increase revenue. Challenges: manual payment. Processes: order capture, payment, invoice. Stakeholders: Sales, Finance." },
      { role: "ai", content: "Tell me more" },
      { role: "user", content: "More detail: current SOP has 5 steps, manual handoffs, need AI fraud detection and cloud migration. Stakeholder IT involved." },
    ];
    const res = await request(app).post("/ai/v1/discovery/ask").set("Authorization", `Bearer ${token}`).send({ conversationHistory: history, projectId: "proj-x", orgId: "org-x" });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("summary");
    expect(res.body.structured).toBeDefined();
  });

  it("Requires auth → 401", async () => {
    const res = await request(app).post("/api/v1/ai/v1/discovery/ask").send({ conversationHistory: [] });
    expect(res.status).toBe(401);
  });
});
