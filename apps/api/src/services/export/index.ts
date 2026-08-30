import { getRepositories } from "../../repositories";
/**
 * Export Service — Real binary file generation for PDF, DOCX, XLSX, and PPTX
 */

import { generatePdf } from "./pdfGenerator";
import { generateDocx } from "./docxGenerator";
import { generateXlsx } from "./xlsxGenerator";
import { generatePptx } from "./pptxGenerator";


export async function generateBinaryExport(
  format: string,
  title: string,
  metadata: { orgId: string; artifactId?: string; projectId?: string },
  content: Record<string, unknown> | Record<string, unknown>[]
): Promise<Buffer> {
  switch (format) {
    case "pdf":
      return await generatePdf(title, metadata, content);
    case "docx":
      return await generateDocx(title, metadata, content);
    case "xlsx":
      return await generateXlsx(title, metadata, content);
    case "pptx":
      return await generatePptx(title, metadata, content);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
