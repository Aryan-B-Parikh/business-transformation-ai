-- Make generatedBy have default for existing rows and future inserts
ALTER TABLE "artifacts" ALTER COLUMN "generated_by" SET DEFAULT 'ai';
UPDATE "artifacts" SET "generated_by" = 'ai' WHERE "generated_by" IS NULL;
ALTER TABLE "artifacts" ALTER COLUMN "generated_by" SET NOT NULL;
