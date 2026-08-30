import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../../src/db/tenant";
import { embed, cosineSimilarity } from "../../src/services/documentParser";

describe("Phase 33 - RAG Benchmark and Cost E2E", () => {
  const dbUrl = process.env.DATABASE_URL;
  let prisma: PrismaClient;

  beforeAll(() => {
    if (dbUrl) {
      prisma = new PrismaClient({
        datasources: { db: { url: dbUrl } },
      });
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("should retrieve chunks via pgvector correctly (Recall@K / Precision@K)", async () => {
    if (!dbUrl) return;
    const orgId = "44444444-4444-4444-4444-444444444444";
    const projId = "proj-rag-e2e";
    
    await withTenant(prisma, orgId, async (tx) => {
      // Setup
      await tx.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: "Org", plan: "trial" } });
      await tx.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "User", email: `${orgId}@example.com`, role: "org_admin" } });
      await tx.workspace.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "WS", createdBy: orgId } });
      await tx.project.create({
        data: { id: projId, orgId, workspaceId: orgId, name: "RAG Proj" }
      });
      await tx.document.create({
        data: { id: "doc-rag-1", projectId: projId, orgId, filename: "test.pdf", storageUrl: "s3://1", type: "pdf", status: "completed", fileId: "f1", parsedStatus: "completed" }
      });

      // Insert vectors
      const chunks = [
        { id: "c1", documentId: "doc-rag-1", orgId, chunkText: "cloud migration strategy", pageRef: 1 },
        { id: "c2", documentId: "doc-rag-1", orgId, chunkText: "cooking recipes for chicken", pageRef: 1 },
        { id: "c3", documentId: "doc-rag-1", orgId, chunkText: "financial forecasting in excel", pageRef: 1 },
      ];

      for (const c of chunks) {
        const vector = embed(c.chunkText);
        // We use executeRaw because prisma $executeRaw doesn't easily support vector array inserts directly
        await tx.$executeRawUnsafe(
          `INSERT INTO "chunks" (id, "documentId", "org_id", "chunkText", "pageRef", embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)`,
          c.id, c.documentId, c.orgId, c.chunkText, c.pageRef, `[${vector.join(',')}]`
        );
      }
    });

    // Query
    await withTenant(prisma, orgId, async (tx) => {
      const queryVec = embed("strategy for cloud migration");
      const k = 1;
      
      const results: any = await tx.$queryRawUnsafe(
        `
        SELECT id, "chunkText", 1 - (embedding <=> $1::vector) as score
        FROM "chunks"
        WHERE "documentId" IN (SELECT id FROM documents WHERE "projectId" = $2)
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        `,
        `[${queryVec.join(',')}]`,
        projId,
        k
      );

      expect(results).toHaveLength(1);
      expect(results[0].chunkText).toContain("cloud migration strategy");
    });
  });
});
