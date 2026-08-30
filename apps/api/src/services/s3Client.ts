import { S3Client } from "@aws-sdk/client-s3";

export function getS3Client(): S3Client | null {
  if (process.env.NODE_ENV === "test" && !process.env.S3_ENDPOINT) {
    return null; // Use mock in tests
  }
  
  if (!process.env.S3_REGION || !process.env.S3_BUCKET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRITICAL INVARIANT VIOLATION: S3_REGION and S3_BUCKET must be set in production");
    }
    return null;
  }

  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "mock-access-key",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "mock-secret-key",
    },
    forcePathStyle: true, // often needed for MinIO/S3-compatible
  });
}
