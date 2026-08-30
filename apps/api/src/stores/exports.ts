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

import { generateBinaryExport } from "../services/export";

export async function createExport(
  artifactId: string,
  orgId: string,
  format: ExportFormat,
  artifactContent: Record<string, unknown>
): Promise<ExportRecord> {
  const id = uuidv4();
  const content = await generateBinaryExport(
    format,
    `Artifact Export (${artifactId})`,
    { orgId, artifactId },
    artifactContent
  );

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

export async function createBundle(
  projectId: string,
  artifactIds: string[],
  orgId: string,
  format: ExportFormat,
  contents: Record<string, unknown>[]
): Promise<ExportRecord> {
  const id = uuidv4();
  const content = await generateBinaryExport(
    format,
    `Project Transformation Bundle (${projectId})`,
    { orgId, projectId },
    contents
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
