/**
 * TASK-018 — Diagram render service
 * DoD: Given each diagram type's fixture spec, produces valid image file; visually spot-checked
 */

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { isValidSvg, renderToSvg } from "../src/services/diagramRenderer";

const app = createApp();
const plain = getSeedPlainPassword();

describe("TASK-018: Diagram render service", () => {
  const fixtures = {
    architecture: { nodes: [{ id: "api", label: "API Gateway" }, { id: "core", label: "Core API" }, { id: "ai", label: "AI Orchestrator" }], edges: [{ from: "api", to: "core" }, { from: "core", to: "ai" }] },
    bpmn: { nodes: [{ id: "start", label: "Start", type: "startEvent" }, { id: "task", label: "Validate", type: "task" }, { id: "end", label: "End", type: "endEvent" }], edges: [{ from: "start", to: "task" }, { from: "task", to: "end" }] },
    er: { nodes: [{ id: "users", label: "users", type: "entity" }, { id: "orders", label: "orders", type: "entity" }], edges: [{ from: "users", to: "orders", label: "1:N" }] },
    wireframe: { nodes: [{ id: "login", label: "Login", type: "auth" }, { id: "dash", label: "Dashboard", type: "dashboard" }], edges: [{ from: "login", to: "dash", label: "login" }] },
  };

  for (const [type, spec] of Object.entries(fixtures)) {
    it(`renders ${type} diagram to valid SVG`, () => {
      const svg = renderToSvg(spec);
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain(spec.nodes[0]!.label);
      // Should have marker for arrows
      expect(svg).toContain("marker");
    });
  }

  it("throws on invalid spec (no nodes)", () => {
    expect(() => renderToSvg({ nodes: [], edges: [] })).toThrow();
  });

  it("throws on missing spec", () => {
    expect(() => renderToSvg(null as unknown as { nodes: []; edges: [] })).toThrow();
  });

  it("POST /api/v1/ai/v1/diagram/render — renders spec via API", async () => {
    const token = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain })).body.token;
    const res = await request(app).post("/api/v1/ai/v1/diagram/render").set("Authorization", `Bearer ${token}`).send({ diagramSpec: fixtures.architecture });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.svg).toContain("<svg");
  });

  it("POST /api/v1/ai/v1/diagram/render — 400 on invalid spec", async () => {
    const token = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain })).body.token;
    const res = await request(app).post("/api/v1/ai/v1/diagram/render").set("Authorization", `Bearer ${token}`).send({ diagramSpec: { nodes: [], edges: [] } });
    expect(res.status).toBe(400);
  });

  it("Integrated: architecture artifact diagram renders via POST /artifacts/:id/render", async () => {
    const token = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain })).body.token;
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Diag ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Diag ${Date.now()}` });
    const arch = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${token}`).send({ projectId: proj.body.id, type: "architecture_hld" });
    const render = await request(app).post(`/api/v1/artifacts/${arch.body.artifactId}/render`).set("Authorization", `Bearer ${token}`).send({});
    expect(render.status).toBe(200);
    expect(render.body.valid).toBe(true);
    expect(render.body.svg).toContain("<svg");
  });
});
