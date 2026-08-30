ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
CREATE INDEX IF NOT EXISTS "users_org_email_idx" ON "users"("org_id", "email");
