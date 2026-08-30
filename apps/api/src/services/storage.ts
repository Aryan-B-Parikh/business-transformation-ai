/** Object storage adapter for documents and generated artifacts. */
import { v4 as uuidv4 } from "uuid";
import { getS3Client } from "./s3Client";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StoredFile { id: string; buffer: Buffer; filename: string; mimetype: string; size: number; createdAt: string; orgId: string; }
const memoryFiles = new Map<string, StoredFile>();

async function putObject(orgId: string, prefix: string, buffer: Buffer, filename: string, mimetype: string) {
  const fileId = uuidv4(); const s3Client = getS3Client();
  if (s3Client) {
    const bucket = process.env.S3_BUCKET!; const key = `${orgId}/${prefix}/${fileId}`;
    await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimetype, Metadata: { filename: Buffer.from(filename).toString("base64") } }));
    return { fileId, storageUrl: `s3://${bucket}/${key}`, key };
  }
  memoryFiles.set(fileId, { id: fileId, buffer, filename, mimetype, size: buffer.length, createdAt: new Date().toISOString(), orgId });
  return { fileId, storageUrl: `memory://${prefix}/${fileId}`, key: `memory://${prefix}/${fileId}` };
}

export async function storeFile(orgId: string, buffer: Buffer, filename: string, mimetype: string) { return putObject(orgId, "documents", buffer, filename, mimetype); }
export async function storeExport(orgId: string, buffer: Buffer, filename: string, mimetype: string) { return putObject(orgId, "exports", buffer, filename, mimetype); }

export async function generateSignedUrl(documentId: string, orgId: string, storageUrl: string): Promise<string> {
  const s3Client = getS3Client();
  if (s3Client && storageUrl.startsWith("s3://")) {
    const bucket = process.env.S3_BUCKET!; const prefix = `s3://${bucket}/`; const key = storageUrl.slice(prefix.length);
    if (!key.startsWith(`${orgId}/`)) throw new Error("Tenant isolation violation");
    return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
  }
  return `/api/v1/documents/${documentId}/file`;
}

export function getMemoryFile(fileId: string): StoredFile | undefined { return memoryFiles.get(fileId); }
export function clearStorage(): void { memoryFiles.clear(); }
