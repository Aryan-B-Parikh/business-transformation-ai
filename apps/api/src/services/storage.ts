/**
 * Mock object storage — TASK-006
 * Simulates S3-compatible storage. In production would be S3/GCS/Azure.
 * Stores buffers in memory, generates signed URLs.
 */

import { v4 as uuidv4 } from "uuid";

interface StoredFile {
  id: string;
  buffer: Buffer;
  filename: string;
  mimetype: string;
  size: number;
  createdAt: string;
}

const files = new Map<string, StoredFile>();

export function storeFile(buffer: Buffer, filename: string, mimetype: string): { fileId: string; storageUrl: string } {
  const fileId = uuidv4();
  const stored: StoredFile = {
    id: fileId,
    buffer,
    filename,
    mimetype,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
  files.set(fileId, stored);
  // storageUrl as per 03_DATA_MODEL.md documents.storage_url
  const storageUrl = `memory://documents/${fileId}/${encodeURIComponent(filename)}`;
  return { fileId, storageUrl };
}

export function getFile(fileId: string): StoredFile | undefined {
  return files.get(fileId);
}

export function getFileBuffer(fileId: string): Buffer | undefined {
  return files.get(fileId)?.buffer;
}

/**
 * Generates a signed URL for retrieval.
 * In real system this would be a presigned S3 URL with expiry.
 * Here we return an API endpoint that is auth-protected and tenant-scoped.
 * Format: /api/v1/documents/:docId/file?token=...  — but for simplicity we return storageUrl
 * and also provide an API route that serves the file.
 */
export function generateSignedUrl(documentId: string, _storageUrl: string): string {
  // The actual file serving checks JWT + tenant isolation, so this URL is effectively signed via auth header.
  return `/api/v1/documents/${documentId}/file`;
}

export function resolveStorageUrl(storageUrl: string): StoredFile | undefined {
  // storageUrl = memory://documents/<fileId>/...
  const match = storageUrl.match(/memory:\/\/documents\/([^/]+)\//);
  if (!match) return undefined;
  return getFile(match[1]!);
}

export function clearStorage(): void {
  files.clear();
}

export function storageStats(): { count: number; totalBytes: number } {
  let total = 0;
  for (const f of files.values()) total += f.size;
  return { count: files.size, totalBytes: total };
}
