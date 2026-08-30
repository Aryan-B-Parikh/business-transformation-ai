import { describe, it, expect } from "vitest";
import { generatePdf } from "../src/services/export/pdfGenerator";
import { generateDocx } from "../src/services/export/docxGenerator";
import { generateXlsx } from "../src/services/export/xlsxGenerator";
import { generatePptx } from "../src/services/export/pptxGenerator";

describe("Phase 5: Real Binary Document Generation", () => {
  const sampleMetadata = {
    orgId: "org-test-enterprise",
    artifactId: "art-test-123",
    projectId: "proj-transformation-456",
  };

  const sampleContent = {
    title: "AI-Powered Customer Support Transformation",
    executiveSummary: "Modernizing legacy CRM into an autonomous agentic platform.",
    estimatedCost: "$150,000",
    timelineMonths: 6,
    modules: ["Voice Agent", "Email Router", "ERP Connector"],
    architecture: {
      cloud: "Azure",
      database: "PostgreSQL + pgvector",
      models: ["GPT-4o", "Claude 3.5 Sonnet"],
    },
  };

  it("generates a valid binary PDF with magic header %PDF", async () => {
    const buffer = await generatePdf("Architecture HLD", sampleMetadata, sampleContent);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    // PDF Magic Bytes: %PDF (0x25 0x50 0x44 0x46)
    const header = buffer.subarray(0, 4).toString("ascii");
    expect(header).toBe("%PDF");
  });

  it("generates a valid binary DOCX with ZIP/PK magic bytes", async () => {
    const buffer = await generateDocx("Business Analysis Document", sampleMetadata, sampleContent);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(2000);
    // DOCX (OpenXML ZIP) Magic Bytes: PK.. (0x50 0x4B 0x03 0x04)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("generates a valid binary XLSX spreadsheet with ZIP/PK magic bytes", async () => {
    const buffer = await generateXlsx("Project Roadmap & Estimation", sampleMetadata, sampleContent);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(2000);
    // XLSX (OpenXML ZIP) Magic Bytes: PK..
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("generates a valid binary PPTX presentation with ZIP/PK magic bytes", async () => {
    const buffer = await generatePptx("Executive Transformation Brief", sampleMetadata, sampleContent);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(2000);
    // PPTX (OpenXML ZIP) Magic Bytes: PK..
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
