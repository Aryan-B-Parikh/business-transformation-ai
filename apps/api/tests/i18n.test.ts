import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-030 — i18n framework
 * DoD: Switching language changes UI strings and a test conversation returns AI replies in selected language
 */

import { t, SUPPORTED_LANGUAGES, normalizeLanguage } from "@bta/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-030: i18n string externalization", () => {
  it("t() returns translations for all supported languages", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const title = t("app.title", lang);
      expect(typeof title).toBe("string");
      expect(title.length).toBeGreaterThan(0);
      // English is default, others should be different (except maybe same)
      if (lang !== "en") expect(title).not.toBe(t("app.title", "en"));
    }
  });

  it("normalizeLanguage handles variants", () => {
    expect(normalizeLanguage("es")).toBe("es");
    expect(normalizeLanguage("es-ES")).toBe("es");
    expect(normalizeLanguage("ES")).toBe("es");
    expect(normalizeLanguage("xx")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
  });

  it("all required keys have translations for all languages", () => {
    const keys = ["app.title", "upload.title", "chat.title", "chat.placeholder", "discovery.summary", "common.send"];
    for (const key of keys) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const val = t(key, lang);
        expect(val).not.toBe(key); // should be translated, not fallback to key
        expect(val.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("TASK-030: AI responses in selected language", () => {
  let token: string;
  let projectId: string;
  let conversationId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS i18n ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj i18n ${Date.now()}` });
    projectId = proj.body.id;
    const conv = await request(app).post(`/api/v1/projects/${projectId}/conversations`).set("Authorization", `Bearer ${token}`).send({});
    conversationId = conv.body.id;
  });

  it("POST /api/v1/ai/v1/discovery/ask — Accept-Language es returns Spanish-prefixed question", async () => {
    const resEn = await request(app).post("/api/v1/ai/v1/discovery/ask").set("Authorization", `Bearer ${token}`).send({ conversationHistory: [{ role: "user", content: "idea" }] });
    expect(resEn.status).toBe(200);
    expect(resEn.body.type).toBe("question");
    expect(resEn.body.question).not.toContain("[es]");

    const resEs = await request(app)
      .post("/api/v1/ai/v1/discovery/ask")
      .set("Authorization", `Bearer ${token}`)
      .set("Accept-Language", "es")
      .send({ conversationHistory: [{ role: "user", content: "idea" }] });
    expect(resEs.status).toBe(200);
    expect(resEs.body.type).toBe("question");
    // Localized response should contain language marker or Spanish translation
    expect(resEs.body.question).toMatch(/\[es\]|Transfo|Negocio/i);
  });

  it("POST /api/v1/ai/v1/consultant/validate-idea — lang es returns localized recommendations", async () => {
    const idea = "We want to automate order processing with API integration and AI for dashboard reporting.";
    const resEn = await request(app).post("/api/v1/ai/v1/consultant/validate-idea").set("Authorization", `Bearer ${token}`).send({ idea });
    const resEs = await request(app).post("/api/v1/ai/v1/consultant/validate-idea").set("Authorization", `Bearer ${token}`).set("Accept-Language", "es").send({ idea });
    expect(resEn.status).toBe(200);
    expect(resEs.status).toBe(200);
    // Spanish response should be prefixed or different
    const enRec = (resEn.body.recommendations || []).join(" ");
    const esRec = (resEs.body.recommendations || []).join(" ");
    expect(esRec).not.toBe(enRec);
    expect(esRec).toMatch(/\[es\]/);
  });

  it("POST /api/v1/conversations/:id/messages — with lang query returns localized AI reply", async () => {
    // Send message with lang=fr via query
    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages?lang=fr`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "idea" });
    expect(res.status).toBe(201);
    expect(res.body.aiMessage).toBeDefined();
    // Even if content is short, the AI question should be localized if lang is fr
    // Our conversation route passes lang to discoveryAsk, so check aiMessage content
    expect(res.body.aiMessage.content).toMatch(/\[fr\]|Français|Transformer/i);
  });

  it("Direct discoveryAsk with lang ja returns Japanese-prefixed summary when sufficient", async () => {
    const history = [
      { role: "user" as const, content: "Goal: automate order to cash, increase revenue. Challenges: manual payment. Processes: order capture, payment, invoice. Stakeholders: Sales, Finance, IT. We have SOP docs." },
      { role: "ai" as const, content: "Tell me more" },
      { role: "user" as const, content: "More detail: current SOP has 5 steps, manual handoffs, need AI fraud detection and cloud migration. Stakeholder IT involved." },
    ];
    const res = await request(app)
      .post("/api/v1/ai/v1/discovery/ask")
      .set("Authorization", `Bearer ${token}`)
      .set("Accept-Language", "ja")
      .send({ conversationHistory: history, lang: "ja" });
    expect(res.body.type).toBe("summary");
    expect(res.body.summary).toMatch(/\[ja\]/);
  });
});
