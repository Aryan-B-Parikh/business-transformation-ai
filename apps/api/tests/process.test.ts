import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-015 — Process Intelligence Designer agent
 * DoD: Output validates against BPMN JSON schema; renders via TASK-018
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { isValidSvg, renderToSvg } from "../src/services/diagramRenderer";
import { validateBpmnJson } from "../src/services/processAgent";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-015: Process Intelligence Designer", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Proc ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Proc ${Date.now()}` });
    projectId = proj.body.id;
  });

  it("POST /api/v1/ai/v1/process/generate-workflow — returns BPMN artifact", async () => {
    const res = await request(app).post("/api/v1/ai/v1/process/generate-workflow").set("Authorization", `Bearer ${token}`).send({ projectId, params: { processName: "Order to Cash" } });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("process_workflow");
    expect(res.body.content.bpmnJson).toBeDefined();
    expect(res.body.content.bpmnJson.nodes.length).toBeGreaterThan(0);
    expect(res.body.content.bpmnJson.flows.length).toBeGreaterThan(0);
    const validation = validateBpmnJson(res.body.content);
    expect(validation.valid).toBe(true);
    // Renders via TASK-018
    const svg = renderToSvg(res.body.content.diagramSpec);
    expect(isValidSvg(svg)).toBe(true);
  });

  it("BPMN flows reference valid nodes", async () => {
    const res = await request(app).post("/api/v1/ai/v1/process/generate-workflow").set("Authorization", `Bearer ${token}`).send({ projectId });
    const bpmn = res.body.content.bpmnJson as { nodes: { id: string }[]; flows: { from: string; to: string }[] };
    const ids = new Set(bpmn.nodes.map((n) => n.id));
    for (const f of bpmn.flows) {
      expect(ids.has(f.from)).toBe(true);
      expect(ids.has(f.to)).toBe(true);
    }
  });
});
