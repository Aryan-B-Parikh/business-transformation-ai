-- Add HNSW index for pgvector cosine similarity (replaces commented IVFFlat in init)
-- HNSW is preferred for small-medium datasets, no training data required
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
