import { describe, it, expect, beforeAll } from "vitest";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

describe("Phase 33 - MinIO Object Storage Integration E2E", () => {
  const s3Endpoint = process.env.S3_ENDPOINT;
  let s3: S3Client;

  beforeAll(() => {
    if (s3Endpoint) {
      s3 = new S3Client({
        region: process.env.S3_REGION || "us-east-1",
        endpoint: s3Endpoint,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
          secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
        },
        forcePathStyle: true,
      });
    }
  });

  it("should successfully upload and sign a URL for MinIO", async () => {
    if (!s3Endpoint) return;
    
    const bucket = process.env.S3_BUCKET || "bta-storage-test";
    const key = `test-e2e-${Date.now()}.txt`;
    
    // Upload object
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "E2E MinIO Test Content",
        ContentType: "text/plain",
      })
    );

    // Get signed URL
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    expect(url).toContain(bucket);
    expect(url).toContain(key);
    
    // Fetch from signed URL
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe("E2E MinIO Test Content");
  });
});
