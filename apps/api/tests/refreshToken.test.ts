import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { SEED_USERS, getSeedPlainPassword } from "../src/auth/users";

describe("Phase 3.4: Refresh Tokens", () => {
  const app = createApp();
  const testUser = SEED_USERS[0];
  const password = getSeedPlainPassword();

  let refreshTokenCookie: string;
  let accessToken: string;

  it("should return a refresh token cookie on login", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: testUser.email,
      password: password,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).not.toHaveProperty("refreshToken"); // should be removed from payload

    // Check for HttpOnly cookie
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    
    const refreshCookie = cookies.find((c: string) => c.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain("HttpOnly");
    
    // Save for next test
    refreshTokenCookie = refreshCookie.split(";")[0];
    accessToken = res.body.token;
  });

  it("should refresh the access token using the cookie", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshTokenCookie)
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
  });

  it("should logout and clear the cookie", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshTokenCookie)
      .send();

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"];
    const refreshCookie = cookies.find((c: string) => c.startsWith("refreshToken="));
    
    // Express clearCookie typically sets the value to empty and expiry in the past
    expect(refreshCookie).toContain("refreshToken=;");
    expect(refreshCookie).toContain("Expires=");
  });

  it("should reject refresh after logout (revoked)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshTokenCookie)
      .send();

    expect(res.status).toBe(401);
  });
});
