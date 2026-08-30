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
import { clearApprovals } from "../src/stores/approvals";
import { clearArtifacts } from "../src/stores/artifacts";
import { clearAuditLogs, listAuditLogs } from "../src/stores/auditLogs";
import { clearComments } from "../src/stores/comments";
import { clearNotifications, listNotifications } from "../src/stores/notifications";

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
    clearArtifacts();
    clearComments();
    clearApprovals();
    clearAuditLogs();
    clearNotifications();
    clearWorkspaces();
    tokenA = await login("org_admin@org-a.com");
    tokenB = await login("contributor@org-a.com");
    const proj = await createProject(tokenA);
    projectId = proj.projectId;
    artifactId = await createArtifact(projectId, tokenA);
  });

  it("Two users can comment on same artifact", async () => {
    const c1 = await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenA}`).send({ content: "Great work!" });
    expect(c1.status).toBe(201);
    expect(c1.body.authorId).toBeDefined();
    const c2 = await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenB}`).send({ content: "Needs more detail on integrations." });
    expect(c2.status).toBe(201);
    const list = await request(app).get(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.map((c: { content: string }) => c.content)).toEqual(expect.arrayContaining(["Great work!", "Needs more detail on integrations."]));
  });

  it("Commenting triggers notification for artifact creator (TASK-026)", async () => {
    // Artifact created by tokenA (org_admin), comment by tokenB should notify tokenA's user
    const before = listNotifications("11111111-1111-1111-1111-111111111111", "00000000-0000-0000-0000-0000000000aa");
    await request(app).post(`/api/v1/artifacts/${artifactId}/comments`).set("Authorization", `Bearer ${tokenB}`).send({ content: "Notify creator" });
    // Notifications may be for creator (org_admin) - check via API
    const notifRes = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${tokenA}`);
    expect(notifRes.status).toBe(200);
    // Should have at least one notification after comment
    expect(notifRes.body.data.length).toBeGreaterThan(before.length);
    expect(notifRes.body.data[0].type).toBe("comment");
  });

  it("Two users can approve, audit log created", async () => {
    const a1 = await request(app).post(`/api/v1/artifacts/${artifactId}/approve`).set("Authorization", `Bearer ${tokenA}`).send({ decision: "approved", comment: "LGTM" });
    expect(a1.status).toBe(201);
    expect(a1.body.decision).toBe("approved");
    const a2 = await request(app).post(`/api/v1/artifacts/${artifactId}/approve`).set("Authorization", `Bearer ${tokenB}`).send({ decision: "changes_requested", comment: "Need more" });
    expect(a2.status).toBe(201);
    // Audit log for approval
    const logs = listAuditLogs("00000000-0000-0000-0000-0000000000aa");
    const approveLogs = logs.filter((l) => l.action === "artifact.approve");
    expect(approveLogs.length).toBeGreaterThanOrEqual(2);
    expect(approveLogs[0].targetId).toBe(artifactId);
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
