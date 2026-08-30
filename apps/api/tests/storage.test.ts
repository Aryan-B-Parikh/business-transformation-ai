import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { storeFile, generateSignedUrl, clearStorage } from "../src/services/storage";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Mock the S3Client constructor and its send method
vi.mock("@aws-sdk/client-s3", () => {
  const sendMock = vi.fn();
  return {
    S3Client: vi.fn(() => ({
      send: sendMock,
    })),
    PutObjectCommand: vi.fn((params) => ({ ...params, type: "PutObject" })),
    GetObjectCommand: vi.fn((params) => ({ ...params, type: "GetObject" })),
  };
});

// Mock the presigner
vi.mock("@aws-sdk/s3-request-presigner", () => {
  return {
    getSignedUrl: vi.fn(async (_client, command) => {
      return `https://mock-s3.com/${command.Bucket}/${command.Key}?signature=mock`;
    }),
  };
});

describe("Phase 5: Object Storage", () => {
  const orgId = "org-123";
  const buffer = Buffer.from("test content");
  
  beforeEach(() => {
    // Set up env for real S3 path
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "http://localhost:9000";
    clearStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    delete process.env.S3_ENDPOINT;
  });

  it("should prefix bucket keys with tenant_id", async () => {
    const { fileId, storageUrl } = await storeFile(orgId, buffer, "test.pdf", "application/pdf");
    
    // Check that storageUrl uses S3 format and is properly prefixed
    expect(storageUrl).toMatch(/^s3:\/\/test-bucket\/org-123\/documents\/.+/);
    
    // Extract the key
    const key = storageUrl.replace("s3://test-bucket/", "");
    expect(key).to.satisfy((k: string) => k.startsWith(`${orgId}/documents/${fileId}`));
  });

  it("should generate a signed URL for a valid tenant object", async () => {
    const { fileId, storageUrl } = await storeFile(orgId, buffer, "test.pdf", "application/pdf");
    
    const signedUrl = await generateSignedUrl("doc-123", orgId, storageUrl);
    expect(signedUrl).toContain("https://mock-s3.com/test-bucket/org-123/documents/");
    expect(signedUrl).toContain("signature=mock");
  });

  it("should throw an error if another tenant attempts to generate a signed URL", async () => {
    const { storageUrl } = await storeFile(orgId, buffer, "test.pdf", "application/pdf");
    
    const maliciousOrgId = "org-999";
    
    await expect(generateSignedUrl("doc-123", maliciousOrgId, storageUrl)).rejects.toThrowError(
      "Tenant isolation violation"
    );
  });
});
