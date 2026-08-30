import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { IDocumentAggregateRepository, DocumentEntity, DocumentChunkEntity } from "../interfaces";
import { withTenant, assertTenant } from "../../db/tenant";

function mapDocument(d: any): DocumentEntity {
  return {
    id: d.id, orgId: d.orgId, projectId: d.projectId, filename: d.filename,
    doc_type: String(d.type), file_size: Number(d.fileSize ?? 0), parsedStatus: d.parsedStatus,
    storage_key: d.storageKey ?? d.storageUrl ?? null, createdAt: d.createdAt, updatedAt: d.updatedAt ?? d.createdAt,
  };
}

export class PostgresDocumentAggregateRepository implements IDocumentAggregateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createDocument(orgId: string, projectId: string, data: { filename: string; docType: string; fileSize: number; storageKey?: string }): Promise<DocumentEntity> {
    assertTenant(orgId);
    const uploadedBy = (data as typeof data & { uploadedBy?: string }).uploadedBy;
    if (!uploadedBy) throw new Error("uploadedBy is required");
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as any;
      const d = await p.document.create({ data: {
        orgId, projectId, filename: data.filename, type: data.docType,
        storageUrl: data.storageKey ?? "", parsedStatus: "pending", uploadedBy,
      } });
      return mapDocument({ ...d, fileSize: data.fileSize, storageKey: data.storageKey });
    });
  }

  async findDocumentById(orgId: string, id: string): Promise<DocumentEntity | null> {
    assertTenant(orgId);
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const d = await (tx as any).document.findFirst({ where: { id, orgId } });
      return d ? mapDocument(d) : null;
    });
  }

  async listDocumentsByProject(orgId: string, projectId: string): Promise<DocumentEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const rows = await (tx as any).document.findMany({ where: { orgId, projectId }, orderBy: { createdAt: "desc" } });
      return rows.map(mapDocument);
    });
  }

  async updateParsedStatus(orgId: string, id: string, status: "pending" | "parsed" | "failed"): Promise<DocumentEntity> {
    assertTenant(orgId);
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as any;
      const d = await p.document.update({ where: { id }, data: { parsedStatus: status } });
      if (d.orgId !== orgId) throw new Error("Tenant isolation violation");
      return mapDocument(d);
    });
  }

  async addChunks(orgId: string, documentId: string, chunks: Array<{ chunkIndex: number; content: string; pageNumber?: number; embedding?: number[] }>): Promise<DocumentChunkEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as any;
      const doc = await p.document.findFirst({ where: { id: documentId, orgId } });
      if (!doc) throw new Error("Document not found");
      const result: DocumentChunkEntity[] = [];
      for (const c of chunks) {
        const id = crypto.randomUUID();
        const vector = c.embedding?.length ? `[${c.embedding.join(",")}]` : null;
        if (vector) await p.$executeRawUnsafe("INSERT INTO document_chunks (id, document_id, org_id, chunk_text, embedding, page_ref) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::vector,$6)", id, documentId, orgId, c.content, vector, c.pageNumber ?? null);
        else await p.$executeRawUnsafe("INSERT INTO document_chunks (id, document_id, org_id, chunk_text, page_ref) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5)", id, documentId, orgId, c.content, c.pageNumber ?? null);
        result.push({ id, orgId, documentId, chunk_index: c.chunkIndex, content: c.content, page_number: c.pageNumber ?? null, embedding: c.embedding ?? null, createdAt: new Date() });
      }
      return result;
    });
  }

  async searchSimilarChunks(orgId: string, projectId: string, queryEmbedding: number[], topK: number): Promise<Array<DocumentChunkEntity & { score: number }>> {
    assertTenant(orgId);
    if (queryEmbedding.length !== 1536) throw new Error("query embedding must have 1536 dimensions");
    const limit = Math.max(1, Math.min(20, Math.floor(topK)));
    const vector = `[${queryEmbedding.join(",")}]`;
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as any;
      const rows = await p.$queryRawUnsafe(`SELECT c.id, c.org_id AS "orgId", c.document_id AS "documentId", c.chunk_text AS content, c.page_ref AS "page_number", c.created_at AS "createdAt", 1 - (c.embedding <=> $1::vector) AS score FROM document_chunks c JOIN documents d ON d.id = c.document_id WHERE c.org_id = $2::uuid AND d.org_id = $2::uuid AND d.project_id = $3::uuid AND c.embedding IS NOT NULL ORDER BY c.embedding <=> $1::vector ASC LIMIT $4`, vector, orgId, projectId, limit);
      return rows.map((r: any) => ({ ...r, chunk_index: 0, embedding: null, score: Number(r.score) }));
    });
  }
}
