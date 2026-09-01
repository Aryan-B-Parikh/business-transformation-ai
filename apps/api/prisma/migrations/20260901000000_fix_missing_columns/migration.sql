-- Fix missing columns that exist in schema.prisma but were absent from init migration
-- Aligns DB with Prisma schema for document_chunks.created_at, artifact_comments.status, audit_logs ip/request etc.
ALTER TABLE "document_chunks" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "artifact_comments" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_id" TEXT;
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "generated_by" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
