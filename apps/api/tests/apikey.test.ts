import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword, ORG_A } from "../src/auth/users";
import { resetRepositoriesForTests } from "../src/repositories";

const app = createApp();
const plain = getSeedPlainPassword();

describe("API-key inbound", () => {
  beforeEach(() => resetRepositoriesForTests());
  it("creates key and pulls artifacts via X-API-Key", async () => {
    const adminToken = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain })).body.token;
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS ak" });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Proj ak" });
    const projectId = proj.body.id;
    const ck = await request(app).post(`/api/v1/admin/orgs/${ORG_A}/api-keys`).set("Authorization", `Bearer ${adminToken}`).send({ scopes: ["artifacts:read"] });
    expect(ck.status).toBe(201);
    const raw = ck.body.raw as string;
    expect(raw).toBeTruthy();
    const viaKey = await request(app).get(`/api/v1/projects/${projectId}/artifacts`).set("X-API-Key", raw);
    expect(viaKey.status).toBe(200);
    const bad = await request(app).get(`/api/v1/projects/${projectId}/artifacts`).set("X-API-Key", "bad");
    expect(bad.status).toBe(401);
    const list = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/api-keys`).set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.data.length).toBeGreaterThan(0);
    const del = await request(app).delete(`/api/v1/admin/orgs/${ORG_A}/api-keys/${ck.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
  });
});
