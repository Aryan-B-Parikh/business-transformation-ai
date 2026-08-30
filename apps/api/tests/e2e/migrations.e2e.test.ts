import { execSync } from "child_process";
import { describe, it, expect, beforeAll } from "vitest";

describe("Phase 33 - Prisma Migration Verification (E2E)", () => {
  const dbUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    if (!dbUrl) {
      console.warn("Skipping migration tests: DATABASE_URL not set");
    }
  });

  it("should deploy migrations cleanly", () => {
    if (!dbUrl) return;
    
    // Run prisma migrate deploy
    const result = execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: "utf-8",
    });
    
    // It should not throw and output should be string
    expect(typeof result).toBe("string");
  });

  it("should verify no migration drift (schema matches DB)", () => {
    if (!dbUrl) return;
    
    // Check migrate status
    const result = execSync("npx prisma migrate status", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: "utf-8",
    });
    
    expect(result).toContain("Database schema is up to date");
  });
});
