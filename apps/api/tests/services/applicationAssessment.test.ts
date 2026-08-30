import { describe, it, expect } from "vitest";
import { assessApplicationContext } from "../../src/services/applicationAssessment";

describe("Phase 9: Deep Existing Application Assessment Engine", () => {
  it("analyzes repository source code, OpenAPI specs, SQL DDL, and infrastructure", () => {
    const assessment = assessApplicationContext({
      files: [
        {
          path: "package.json",
          content: '{"dependencies": {"react": "^18.0.0", "express": "^4.18.0", "prisma": "^5.0.0"}}',
        },
        {
          path: "src/server.ts",
          content: 'import express from "express"; const secret = "super_secret_key";',
        },
        {
          path: "openapi.yaml",
          content: `
openapi: 3.0.0
paths:
  /users:
    get:
      summary: List users
    post:
      summary: Create user
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`,
        },
        {
          path: "schema.sql",
          content: "CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100)); CREATE TABLE orders (id INT, customer_id INT, FOREIGN KEY (customer_id) REFERENCES customers(id));",
        },
        {
          path: "Dockerfile",
          content: "FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD [\"node\", \"dist/index.js\"]",
        },
        {
          path: "infra.tf",
          content: 'resource "azurerm_resource_group" "rg" { name = "transformation-rg" }',
        },
      ],
    });

    expect(assessment.languages).toContain("TypeScript");
    expect(assessment.frameworks).toContain("React");
    expect(assessment.frameworks).toContain("Express");
    expect(assessment.frameworks).toContain("Prisma");
    expect(assessment.infrastructure.hasDocker).toBe(true);
    expect(assessment.infrastructure.cloudProviders).toContain("Azure");
    expect(assessment.apiInventory.totalEndpoints).toBe(2);
    expect(assessment.apiInventory.authMechanisms).toContain("JWT / Bearer");
    expect(assessment.databaseTopology.tables).toBe(2);
    expect(assessment.databaseTopology.foreignKeys).toBe(1);
    expect(assessment.securityConcerns.length).toBeGreaterThanOrEqual(1);
    expect(assessment.modernizationOpportunities.length).toBeGreaterThanOrEqual(2);
  });
});
