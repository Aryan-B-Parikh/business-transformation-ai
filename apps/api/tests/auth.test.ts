/**
 * TASK-003 — Auth service
 * DoD: Integration test logs in a seeded user and receives a valid JWT;
 *      expired/invalid tokens are rejected with 401
 * Spec: 04_API_SPEC.md Auth & Orgs
 */

import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../src/app";
import { signExpiredToken, verifyToken } from "../src/auth/jwt";
import { getSeedPlainPassword, ORG_A, SEED_USERS } from "../src/auth/users";

const app = createApp();

describe("TASK-003: Auth service", () => {
  const plain = getSeedPlainPassword();
  const seeded = SEED_USERS[0]; // org_admin@org-a.com

  it("POST /api/v1/auth/login — valid credentials returns JWT with org_id/role claims", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: seeded.email, password: plain });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.email).toBe(seeded.email);
    expect(res.body.user.orgId).toBe(seeded.orgId);
    expect(res.body.user.role).toBe(seeded.role);

    // Verify JWT payload
    const payload = verifyToken(res.body.token);
    expect(payload.userId).toBe(seeded.id);
    expect(payload.orgId).toBe(seeded.orgId);
    expect(payload.role).toBe(seeded.role);
    expect(payload.email).toBe(seeded.email);
  });

  it("POST /api/v1/auth/login — wrong password → 401", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: seeded.email, password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toMatch(/INVALID_CREDENTIALS|UNAUTHORIZED/);
  });

  it("POST /api/v1/auth/login — unknown email → 401", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "nope@example.com", password: plain });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/login — missing fields → 400", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: seeded.email });
    expect(res.status).toBe(400);
  });

  it("POST /api/v1/auth/sso/callback — returns JWT for SSO user (code = email)", async () => {
    const ssoUser = SEED_USERS.find((u) => u.ssoProvider)!;
    const res = await request(app).post("/api/v1/auth/sso/callback").send({ provider: "azure_ad", code: ssoUser.email });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    const payload = verifyToken(res.body.token);
    expect(payload.orgId).toBe(ssoUser.orgId);
    expect(payload.role).toBe(ssoUser.role);
  });

  it("POST /api/v1/auth/sso/callback — base64 code also works", async () => {
    const ssoUser = SEED_USERS.find((u) => u.ssoProvider)!;
    const b64 = Buffer.from(ssoUser.email).toString("base64");
    const res = await request(app).post("/api/v1/auth/sso/callback").send({ provider: "azure_ad", code: b64 });
    expect(res.status).toBe(200);
  });

  it("GET /api/v1/orgs/me — with valid JWT returns org", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({ email: seeded.email, password: plain });
    const token = login.body.token;
    const res = await request(app).get("/api/v1/orgs/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(seeded.orgId);
  });

  it("GET /api/v1/orgs/me — without token → 401", async () => {
    const res = await request(app).get("/api/v1/orgs/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/v1/orgs/me — with invalid token → 401", async () => {
    const res = await request(app).get("/api/v1/orgs/me").set("Authorization", "Bearer invalid.token.here");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toMatch(/INVALID_TOKEN|UNAUTHORIZED/);
  });

  it("GET /api/v1/orgs/me — with expired token → 401", async () => {
    const expired = signExpiredToken({ userId: seeded.id, orgId: seeded.orgId, role: seeded.role, email: seeded.email });
    const res = await request(app).get("/api/v1/orgs/me").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("verifyToken — token missing org_id/role should be invalid (tenant never client-supplied)", async () => {
    // Create raw JWT without orgId/role to simulate client tampering — should be rejected
    const jwt = await import("jsonwebtoken");
    const raw = jwt.default.sign(
      { userId: seeded.id, role: seeded.role, email: seeded.email },
      process.env.JWT_SECRET || "dev_jwt_secret_change_in_production_32chars!"
    );
    const res = await request(app).get("/api/v1/orgs/me").set("Authorization", `Bearer ${raw}`);
    expect(res.status).toBe(401);
  });

  it("Tenant isolation: JWT org_id is trusted, path orgId must match JWT orgId", async () => {
    const loginA = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
    const tokenA = loginA.body.token;
    // Try to access org B's users with org A token — should be 403 cross-tenant
    const res = await request(app).get(`/api/v1/orgs/${ORG_A === seeded.orgId ? "00000000-0000-0000-0000-0000000000bb" : ORG_A}/users`).set("Authorization", `Bearer ${tokenA}`);
    expect([403, 401, 404]).toContain(res.status);
    if (res.status === 403) expect(res.body.error.message).toMatch(/Cross-tenant/);
  });
});
