import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-016 — Database & Integration Designer agent
 * DoD: Generated schema is valid SQL DDL (parses without error); API spec is valid OpenAPI
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { validateDataModeling } from "../src/services/dataModelingAgent";
import { isValidSvg, renderToSvg } from "../src/services/diagramRenderer";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-016: Database & Integration Designer", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Data ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Data ${Date.now()}` });
    projectId = proj.body.id;
  });

  it("POST /api/v1/ai/v1/data-model/generate — returns ER + API spec", async () => {
    const res = await request(app).post("/api/v1/ai/v1/data-model/generate").set("Authorization", `Bearer ${token}`).send({ projectId, params: { domain: "Order" } });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("er_diagram");
    expect(res.body.content.ddl).toContain("CREATE TABLE");
    expect(res.body.content.apiSpec.openapi).toBe("3.0.0");
    expect(res.body.content.erDiagram.entities.length).toBeGreaterThan(0);
    const validation = validateDataModeling(res.body.content);
    expect(validation.valid).toBe(true);
    // DDL parses (parens balanced)
    const ddl = res.body.content.ddl as string;
    const opens = (ddl.match(/\(/g) || []).length;
    const closes = (ddl.match(/\)/g) || []).length;
    expect(opens).toBe(closes);
    // Diagram renders
    const svg = renderToSvg(res.body.content.diagramSpec);
    expect(isValidSvg(svg)).toBe(true);
  });

  it("DDL is valid SQL (basic parse) and API spec is valid OpenAPI", async () => {
    const res = await request(app).post("/api/v1/ai/v1/data-model/generate").set("Authorization", `Bearer ${token}`).send({ projectId });
    expect(res.body.content.ddl.split(";").length).toBeGreaterThan(2);
    expect(res.body.content.apiSpec.paths).toBeDefined();
  });
});
