/**
 * Object storage adapter — Phase 5
 * Connects to S3-compatible backend in production, falls back to memory for tests.
 */

import { v4 as uuidv4 } from "uuid";
import { getS3Client } from "./s3Client";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StoredFile {
  id: string;
  buffer: Buffer;
  filename: string;
  mimetype: string;
  size: number;
  createdAt: string;
  orgId: string;
}

const memoryFiles = new Map<string, StoredFile>();

/**
 * Stores a file. If S3 is configured, uploads to S3 with prefix <orgId>/documents/<fileId>
 */
export async function storeFile(orgId: string, buffer: Buffer, filename: string, mimetype: string): Promise<{ fileId: string; storageUrl: string }> {
  const fileId = uuidv4();
  const s3Client = getS3Client();

  if (s3Client) {
    const bucket = process.env.S3_BUCKET!;
    const key = `${orgId}/documents/${fileId}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      Metadata: { filename: Buffer.from(filename).toString('base64') } // safe encoding
    }));

    return { fileId, storageUrl: `s3://${bucket}/${key}` };
  } else {
    // Memory fallback
    memoryFiles.set(fileId, {
      id: fileId,
      buffer,
      filename,
      mimetype,
      size: buffer.length,
      createdAt: new Date().toISOString(),
      orgId
    });
    return { fileId, storageUrl: `memory://documents/${fileId}/${encodeURIComponent(filename)}` };
  }
}

/**
 * Generates a signed URL for retrieval.
 */
export async function generateSignedUrl(documentId: string, orgId: string, storageUrl: string): Promise<string> {
  const s3Client = getS3Client();
  if (s3Client && storageUrl && storageUrl.startsWith("s3://")) {
    const bucket = process.env.S3_BUCKET!;
    // storageUrl = s3://<bucket>/<orgId>/documents/<fileId>
    const prefix = `s3://${bucket}/`;
    const key = storageUrl.slice(prefix.length);

    // Tenant isolation verification: enforce that the generated URL belongs to the requesting orgId
    if (!key.startsWith(`${orgId}/`)) {
      throw new Error("Tenant isolation violation: Cannot generate signed URL for a different organization's object.");
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    
    // Expires in 15 minutes
    return await getSignedUrl(s3Client, command, { expiresIn: 900 });
  } else {
    // Memory fallback: we return a virtual API endpoint just like before, but wait, the test relies on fetching it via /api/v1/documents/:id/file
    // Memory fallback: we return a virtual API endpoint just like before
    return `/api/v1/documents/${documentId}/file`;
  }
}

export function getMemoryFile(fileId: string): StoredFile | undefined {
  return memoryFiles.get(fileId);
}

export function clearStorage(): void {
  memoryFiles.clear();
}
