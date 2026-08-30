/**
 * Export store — TASK-025
 * Simulates rendering artifacts to PDF/DOCX/XLSX/PPTX
 */

import { v4 as uuidv4 } from "uuid";

export type ExportFormat = "pdf" | "docx" | "xlsx" | "pptx";

export interface ExportRecord {
  id: string;
  artifactId: string | null; // null for bundle
  projectId: string | null; // for bundle
  artifactIds: string[] | null;
  orgId: string;
  format: ExportFormat;
  downloadUrl: string;
  content: Buffer; // simulated file content
  createdAt: string;
}

const exportRecords = new Map<string, ExportRecord>();

export function clearExports(): void {
  exportRecords.clear();
}

export function createExport(artifactId: string, orgId: string, format: ExportFormat, artifactContent: Record<string, unknown>): ExportRecord {
  const id = uuidv4();
  const content = Buffer.from(`Export ${format.toUpperCase()} for artifact ${artifactId}\n${JSON.stringify(artifactContent, null, 2)}\nGenerated at ${new Date().toISOString()}\n`);
  const rec: ExportRecord = {
    id,
    artifactId,
    projectId: null,
    artifactIds: null,
    orgId,
    format,
    downloadUrl: `/api/v1/exports/${id}/download`,
    content,
    createdAt: new Date().toISOString(),
  };
  exportRecords.set(id, rec);
  return rec;
}

export function createBundle(projectId: string, artifactIds: string[], orgId: string, format: ExportFormat, contents: Record<string, unknown>[]): ExportRecord {
  const id = uuidv4();
  const content = Buffer.from(
    `Bundle ${format} for project ${projectId} with ${artifactIds.length} artifacts\nIDs: ${artifactIds.join(", ")}\n${JSON.stringify(contents, null, 2)}\n`
  );
  const rec: ExportRecord = {
    id,
    artifactId: null,
    projectId,
    artifactIds,
    orgId,
    format,
    downloadUrl: `/api/v1/exports/${id}/download`,
    content,
    createdAt: new Date().toISOString(),
  };
  exportRecords.set(id, rec);
  return rec;
}

export function getExport(id: string): ExportRecord | undefined {
  return exportRecords.get(id);
}

export function listExports(orgId: string): ExportRecord[] {
  return [...exportRecords.values()].filter((e) => e.orgId === orgId);
}
