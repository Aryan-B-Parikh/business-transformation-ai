# Disaster Recovery — RPO <1h, RTO <4h (AUDIT §32, PDF high availability)

## Backups
- **DB**: PITR via `pg_basebackup` + WAL archiving to S3 (`s3://bta-backups/db/`), hourly base + continuous WAL. Retention 30d. Verify: `pg_verifybackup`.
- **Object storage**: versioned bucket replication (`STORAGE_BACKEND=s3`, `S3_BUCKET` replicated to secondary region).
- **Migrations**: `prisma migrate deploy` idempotent; verification `scripts/verify-release-gate.ts`.

## Restore Drill (staging, quarterly)
1. Provision fresh `DATABASE_URL` (empty).
2. `prisma migrate deploy` → should succeed on empty DB.
3. Restore latest base + replay WAL to `recovery_target_time = now() - 30m`.
4. `psql -c "SELECT count(*) FROM organizations"` → expect >0.
5. `GET /readyz` → 200 (prisma `$queryRaw SELECT 1`).
6. Run `tests/goldenPath.e2e.test.ts` against restored DB + MinIO.

## RTO Steps (<4h)
- `terraform apply` infra + `docker-compose.test.yml` (pgvector, minio, parser-sandbox).
- Restore DB, re-deploy `apps/api` (`PORT=3001`, `STORAGE_BACKEND=postgres`).
- Validate `GET /api/v1/openapi.json` + `GET /healthz`.

## Runbook Contacts
- On-call: `ops@bta.example` | PagerDuty `BTA-API`.
- Failure injection: tested via `tests/e2e/dr.e2e.test.ts` (simulated DB partition).

## Idempotency
- Outbox `outbox_events` (`status pending→delivered/dead_letter`, `attempt_count`, `next_retry_at`) ensures exactly-once webhook delivery with exponential backoff (`workers/index.ts:17` claims `mock matching` → replace with `SELECT … FOR UPDATE SKIP LOCKED`).
