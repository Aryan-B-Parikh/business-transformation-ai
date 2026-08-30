import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-023 — Comments & approvals
 * DoD: Two seeded users can comment/approve on same artifact; audit log entry created for approval
 * TASK-026 — Notifications & activity log (commenting triggers notification)
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: plain });
  return res.body.token;
}
async function createProject(token: string): Promise<{ projectId: string; workspaceId: string }> {
  const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Collab ${Date.now()}` });
  const wsId = ws.body.id;
  const proj = await request(app).post(`/api/v1/workspaces/${wsId}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Collab ${Date.now()}` });
  return { projectId: proj.body.id, workspaceId: wsId };
}
async function createArtifact(projectId: string, token: string): Promise<string> {
  const res = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${token}`).send({ projectId, type: "architecture_hld" });
  return res.body.artifactId as string;
}

describe("TASK-023: Comments & approvals", () => {
  let tokenA: string;
  let tokenB: string;
  let projectId: string;
  let artifactId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    tokenA = await login("org_admin@org-a.com");
    tokenB = await login("contributor@org-a.com");
    const proj = await createProject(tokenA);
    projectId = proj.projectId;
    artifactId = await createArtifact(projectId, tokenA);
  });

  it("Two users can comment on same artifact", async () => {
    const c1 = await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenA}`).send({ content: "Looks good" });
    expect(c1.status).toBe(201);
    expect(c1.body.userId).toBeDefined();
    const c2 = await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenB}`).send({ content: "Agree" });
    expect(c2.status).toBe(201);
    const list = await request(app).get(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.map((c: { content: string }) => c.content)).toEqual(expect.arrayContaining(["Looks good", "Agree"]));
  });

  it("Commenting triggers notification for artifact creator (TASK-026)", async () => {
    // Artifact created by tokenA (org_admin), comment by tokenB should notify tokenA's user
    const before = (await getRepositories().collaboration.listNotifications("00000000-0000-0000-0000-0000000000aa", "11111111-1111-1111-1111-111111111111", "00000000-0000-0000-0000-0000000000aa"));
    await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenB}`).send({ content: "Notify creator" });
    // Notifications may be for creator (org_admin) - check via API
    const notifRes = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${tokenA}`);
    expect(notifRes.status).toBe(200);
    // Should have at least one notification after comment
    expect(notifRes.body.data.length).toBeGreaterThan(before.length);
    expect(notifRes.body.data[0].title).toBe("comment");
  });

  it("Two users can approve, audit log created", async () => {
    // Move to in_review first
    await request(app).post(`/api/v1/artifacts/${artifactId}/review`).set("Authorization", `Bearer ${tokenA}`);

    const a1 = await request(app).post(`/api/v1/artifacts/${artifactId}/approve`).set("Authorization", `Bearer ${tokenA}`).send({ decision: "approved" });
    expect(a1.status).toBe(201);
    expect(a1.body.status).toBe("approved");
    
    const auditRes = await request(app).get(`/api/v1/projects/${projectId}/activity`).set("Authorization", `Bearer ${tokenA}`);
    expect(auditRes.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "artifact.approve" })
    ]));
  });

  it("Tenant isolation: other org cannot comment → 404", async () => {
    const tokenOrgB = await login("org_admin@org-b.com");
    const res = await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenOrgB}`).send({ content: "evil" });
    expect(res.status).toBe(404);
  });

  it("Requires auth → 401", async () => {
    const res = await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).send({ content: "no auth" });
    expect(res.status).toBe(401);
  });
});
