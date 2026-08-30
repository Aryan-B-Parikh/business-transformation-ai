import { describe, it, expect, beforeEach, vi } from "vitest";
import { processDocument, clearChunks, ExtractionLimitError, TimeoutError } from "../src/services/documentParser";
import { v4 as uuidv4 } from "uuid";

describe("Phase 6: Document Processing Security", () => {
  const orgId = "org-sec-123";

  beforeEach(() => {
    clearChunks();
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (process.env.TEST_SLOW_PARSER) {
        await new Promise(resolve => setTimeout(resolve, Number(process.env.TEST_SLOW_PARSER)));
      }
      return {
        ok: true,
        json: async () => ({ content: "normal text content" }),
        text: async () => ""
      };
    }) as any;
  });

  it("should throw ExtractionLimitError if buffer exceeds 10MB limit", async () => {
    const documentId = uuidv4();
    // Simulate an 11MB buffer
    const hugeBuffer = Buffer.alloc(11 * 1024 * 1024, "a");

    await expect(
      processDocument({
        documentId,
        orgId,
        buffer: hugeBuffer,
        filename: "huge.pdf",
      })
    ).rejects.toThrowError(ExtractionLimitError);
  });

  it("should throw ExtractionLimitError if extracted text exceeds 500,000 characters", async () => {
    const documentId = uuidv4();
    // 500,001 characters of printable text
    const textBuffer = Buffer.from("a".repeat(500001));

    await expect(
      processDocument({
        documentId,
        orgId,
        buffer: textBuffer,
        filename: "long-text.pdf",
      })
    ).rejects.toThrowError(ExtractionLimitError);
  });

  it("should throw TimeoutError if parser takes longer than TEST_FAST_TIMEOUT", async () => {
    const documentId = uuidv4();
    const normalBuffer = Buffer.from("normal text content");

    // Force timeout to be short, and parser to be slow
    process.env.TEST_FAST_TIMEOUT = "10";
    process.env.TEST_SLOW_PARSER = "50";

    await expect(
      processDocument({
        documentId,
        orgId,
        buffer: normalBuffer,
        filename: "timeout.pdf",
      })
    ).rejects.toThrowError(TimeoutError);

    delete process.env.TEST_FAST_TIMEOUT;
    delete process.env.TEST_SLOW_PARSER;
    vi.restoreAllMocks();
  });

  it("should process normally within bounds", async () => {
    const documentId = uuidv4();
    const normalBuffer = Buffer.from("normal text content");

    const chunks = await processDocument({
      documentId,
      orgId,
      buffer: normalBuffer,
      filename: "valid.pdf",
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkText).toBe("normal text content");
    vi.restoreAllMocks();
  });
});
