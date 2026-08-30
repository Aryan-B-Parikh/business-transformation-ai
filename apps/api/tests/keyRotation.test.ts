import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "../src/auth/jwt";
import { SEED_USERS } from "../src/auth/users";

describe("Phase 3.2: Signing Key Rotation", () => {
  const testUser = SEED_USERS[0];

  it("should successfully sign and verify a token with the primary key", () => {
    const token = signToken({
      userId: testUser.id,
      orgId: testUser.orgId,
      role: testUser.role,
      email: testUser.email,
    });
    
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // Header.Payload.Signature

    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(testUser.id);
    expect(decoded.orgId).toBe(testUser.orgId);
  });
});
