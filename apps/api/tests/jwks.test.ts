import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("Phase 3.3: JWKS Endpoint", () => {
  const app = createApp();

  it("should expose /.well-known/jwks.json", async () => {
    const res = await request(app).get("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("keys");
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThan(0);

    const key = res.body.keys[0];
    expect(key).toHaveProperty("kty", "RSA");
    expect(key).toHaveProperty("alg", "RS256");
    expect(key).toHaveProperty("kid");
    expect(key).toHaveProperty("use", "sig");
    expect(key).toHaveProperty("n");
    expect(key).toHaveProperty("e");
  });
});
