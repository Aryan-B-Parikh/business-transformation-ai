# Compliance Mapping — SOC2 / ISO27001 (aligned, not certified)

> Maps platform controls to implementation checks in this repo. For audit evidence, run `./scripts/verify-release-gate.ts` + CI gates.

| Control | Requirement | Implementation | Evidence |
|---|---|---|---|
| CC6.1 Logical access | RBAC per tenant | `middleware/rbac.ts:21` role allow-lists, `hasProjectAccess` lenient, `tenant.ts:17` `set_config('app.current_org_id', $1, true)` + `migrations/20260830000001_rls` `ENABLE ROW LEVEL SECURITY` + `FORCE` on 16 tables | `rbac.test.ts` 55, `rls.test.ts`, `crossTenantAttack.test.ts` |
| CC6.6 Encryption | At-rest & in-transit | `services/storage.ts:9` S3 `SSE-AES256` + signed URLs, `auth/jwt.ts:20` RS256, `helmet` + `cors` in `app.ts:27`, `DATABASE_URL` TLS `pg` | `documentSecurity.test.ts`, `jwks.test.ts` |
| CC7.2 Monitoring | Health + audit | `app.ts:36` `/healthz` `/readyz` DB check, `admin.ts:36` usage + `ai_usage_logs`, `governance.recordAuditLog` append-only `audit_logs` | `admin.test.ts`, `audit.test.ts` |
| CC8.1 Change mgmt | Versioned artifacts, no auto-approve | `artifacts.ts:193` `draft→in_review→approved` via `POST /approve` only, `schema.prisma:144` `CHECK artifacts_no_auto_approve` | `artifacts.test.ts` 8 |
| A1.2 Availability | Backup & DR | `docker-compose.test.yml:1` pgvector+minio, `disasterRecovery.test.ts`, `LOAD_TEST.md` p95 targets | `dr.e2e.test.ts` |
| ISO A.12.4 Logging | Audit trail | `governance` `listAuditLogs` filtered by actor/action/date, `collaboration` activity project-scoped | `collaboration.test.ts` |
| ISO A.13.2 Transfer | Webhook SSRF | `webhook/ssrfGuard.ts:25` DNS→IP validation on initial+redirect hops, `dispatcher.ts:20` HMAC `X-BTA-Signature-256` + `X-BTA-Event` | `ssrfGuard.test.ts`, `webhook.test.ts` |
| ISO A.9.4 Access control | API-key | `middleware/apiKey.ts:11` sha256 + scopes, `middleware/auth.ts:8` dual JWT/API-key, `admin` CRUD `/api-keys` | `apikey.test.ts` 1 |

**SLOs** — `02 §6`: AI discovery `<5s p95`, blueprint `<3m p95`, API `<200ms p95`, exports `<5s`, webhooks `<2s`; tracked via `utils/telemetry.ts` `recordAITelemetry` + `middleware/trace.ts` `requestId`.
