import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, ParsedStatus } from "@prisma/client";
import { withTenant } from "../../src/db/tenant";
import { embed } from "../../src/services/documentParser";

describe("Phase 33 - RAG Benchmark and Cost E2E", () => {
  const dbUrl = process.env.DATABASE_URL;
  let prisma: PrismaClient;

  beforeAll(() => {
    if (dbUrl) {
      prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("should retrieve chunks via pgvector correctly (Recall@K / Precision@K)", async () => {
    if (!dbUrl) return;
    const orgId = "44444444-4444-4444-4444-444444444444";
    const projId = "00000000-0000-0000-0000-000000000004";
    const documentId = "00000000-0000-0000-0000-000000000005";

    await withTenant(prisma, orgId, async (tx) => {
      await tx.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: "Org", plan: "trial" } });
      await tx.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "User", email: `${orgId}@example.com`, role: "org_admin" } });
      await tx.workspace.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "WS", createdBy: orgId } });
      await tx.project.create({ data: { id: projId, orgId, workspaceId: orgId, name: "RAG Proj" } });
      await tx.document.create({
        data: {
          id: documentId,
          orgId,
          filename: "test.pdf",
          storageUrl: "s3://1",
          type: "pdf",
          parsedStatus: ParsedStatus.parsed,
          project: { connect: { id: projId } },
          uploader: { connect: { id: orgId } },
        },
      });

      const chunks = [
        { id: "00000000-0000-0000-0000-000000000011", chunkText: "cloud migration strategy", pageRef: 1 },
        { id: "00000000-0000-0000-0000-000000000012", chunkText: "cooking recipes for chicken", pageRef: 1 },
        { id: "00000000-0000-0000-0000-000000000013", chunkText: "financial forecasting in excel", pageRef: 1 },
      ];

      for (const c of chunks) {
        const vector = embed(c.chunkText);
        await tx.$executeRawUnsafe(
          `INSERT INTO "document_chunks" (id, "document_id", "org_id", "chunk_text", "page_ref", embedding) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::vector)`,
          c.id, documentId, orgId, c.chunkText, c.pageRef, `[${vector.join(",")}]`,
        );
      }
    });

    await withTenant(prisma, orgId, async (tx) => {
      const queryVec = embed("strategy for cloud migration");
      const results: Array<{ id: string; chunkText: string; score: number }> = await tx.$queryRawUnsafe(
        `SELECT dc.id, dc."chunk_text" AS "chunkText", 1 - (dc.embedding <=> $1::vector) AS score
         FROM "document_chunks" dc
         INNER JOIN "documents" d ON d.id = dc."document_id"
         WHERE d."project_id" = $2::uuid
           AND dc."org_id" = $3::uuid
         ORDER BY dc.embedding <=> $1::vector
         LIMIT $4`,
        `[${queryVec.join(",")}]`, projId, orgId, 1,
      );

      expect(results).toHaveLength(1);
      expect(results[0].chunkText).toContain("cloud migration strategy");
    });
  });
});
