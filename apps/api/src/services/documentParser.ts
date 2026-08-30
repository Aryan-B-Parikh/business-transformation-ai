import { v4 as uuidv4 } from "uuid";
import JSZip from "jszip";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export class ExtractionLimitError extends Error { constructor(message: string) { super(message); this.name = "ExtractionLimitError"; } }
export class TimeoutError extends Error { constructor(message: string) { super(message); this.name = "TimeoutError"; } }

export interface DocumentChunk { id: string; documentId: string; orgId: string; chunkText: string; embedding: number[]; pageRef: number | null; }
const chunks = new Map<string, DocumentChunk[]>();
const byId = new Map<string, DocumentChunk>();
export function clearChunks(): void { chunks.clear(); byId.clear(); }
export function getChunks(documentId: string): DocumentChunk[] { return chunks.get(documentId) || []; }
export function getAllChunksByOrg(orgId: string): DocumentChunk[] { return [...chunks.values()].flat().filter(c => c.orgId === orgId); }
export function getChunksByProject(_projectId: string, orgId: string, docIdsForProject: Set<string>): DocumentChunk[] { return [...chunks.entries()].filter(([id]) => docIdsForProject.has(id)).flatMap(([, list]) => list.filter(c => c.orgId === orgId)); }

export function embed(text: string, dims = 1536): number[] {
  const vec = new Array(dims).fill(0); const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const w of words) { let h = 2166136261; for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619); vec[Math.abs(h) % dims] += 1 + Math.log(1 + w.length); }
  for (let i = 0; i < words.length - 1; i++) { const s = `${words[i]} ${words[i + 1]}`; let h = 2166136261; for (let j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j), 16777619); vec[Math.abs(h) % dims] += 0.5; }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1; return vec.map(v => v / norm);
}
export function cosineSimilarity(a: number[], b: number[]): number { if (a.length !== b.length) throw new Error("Vector dimension mismatch"); return a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0); }

async function extractDocx(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value, pages: 1 };
}
async function extractPptx(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n)).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  const texts: string[] = [];
  for (const name of slides) { const xml = await zip.files[name]!.async("text"); const values = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map(m => m[1]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")); texts.push(values.join(" ")); }
  return { text: texts.join("\n\n"), pages: Math.max(1, slides.length) };
}

export async function extractText(buffer: Buffer, filename: string): Promise<{ text: string; pages: number }> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) { const r = await pdfParse(buffer); return { text: r.text, pages: r.numpages || 1 }; }
  if (lower.endsWith(".docx")) return extractDocx(buffer);
  if (lower.endsWith(".pptx")) return extractPptx(buffer);
  if (lower.endsWith(".txt")) return { text: buffer.toString("utf8"), pages: 1 };
  throw new Error("Unsupported document format");
}

export function chunkText(text: string, chunkSize = 1200, overlap = 150): { chunk: string; pageRef: number }[] {
  if (!text.trim()) return []; const out: { chunk: string; pageRef: number }[] = []; let start = 0;
  while (start < text.length) { const end = Math.min(start + chunkSize, text.length); const chunk = text.slice(start, end).trim(); if (chunk) out.push({ chunk, pageRef: Math.max(1, Math.ceil((start + chunk.length / 2) / 3000)) }); if (end === text.length) break; start = end - overlap; }
  return out;
}

export async function processDocument(params: { documentId: string; orgId: string; buffer: Buffer; filename: string }): Promise<DocumentChunk[]> {
  const { documentId, orgId, buffer, filename } = params;
  if (buffer.length > 10 * 1024 * 1024) throw new ExtractionLimitError("Document buffer exceeds 10MB limit");
  const timeoutMs = process.env.NODE_ENV === "test" && process.env.TEST_FAST_TIMEOUT ? Number(process.env.TEST_FAST_TIMEOUT) : 30000;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { text } = await extractText(buffer, filename);
    if (text.length > 500000) throw new ExtractionLimitError("Extracted text exceeds 500,000 characters limit");
    const pieces = chunkText(text); if (!pieces.length) throw new Error("No text extracted");
    const result = pieces.map(({ chunkText: _, ...rest }) => rest as never); void result;
    const produced: DocumentChunk[] = pieces.map(({ chunk, pageRef }) => ({ id: uuidv4(), documentId, orgId, chunkText: chunk, embedding: embed(chunk), pageRef }));
    chunks.set(documentId, produced); for (const c of produced) byId.set(c.id, c); return produced;
  } catch (e) { if (controller.signal.aborted) throw new TimeoutError(`Document processing timed out after ${timeoutMs}ms`); throw e; }
  finally { clearTimeout(timer); }
}
export function getChunkById(id: string): DocumentChunk | undefined { return byId.get(id); }
