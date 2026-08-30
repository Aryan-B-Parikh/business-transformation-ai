import { S3Client } from "@aws-sdk/client-s3";

export function getS3Client(): S3Client | null {
  const isTest = process.env.NODE_ENV === "test" && !process.env.S3_ENDPOINT;
  if (isTest) return null;

  if (!process.env.S3_REGION || !process.env.S3_BUCKET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRITICAL STORAGE CONFIGURATION: S3_REGION and S3_BUCKET are required in production");
    }
    return null;
  }

  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (process.env.NODE_ENV === "production" && (!accessKeyId || !secretAccessKey)) {
    throw new Error("CRITICAL STORAGE CONFIGURATION: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required in production");
  }

  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
}
