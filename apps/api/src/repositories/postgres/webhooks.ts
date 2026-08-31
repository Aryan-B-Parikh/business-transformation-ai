import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { IWebhookAggregateRepository,WebhookConfigEntity,OutboxEventEntity } from "../interfaces";
import { withTenant,assertTenant } from "../../db/tenant";
export class PostgresWebhookAggregateRepository implements IWebhookAggregateRepository{
 constructor(private readonly prisma:PrismaClient){}
 async createConfig(orgId:string,workspaceId:string,data:{url:string;events:string[];secret?:string}){assertTenant(orgId);return withTenant(this.prisma as never,orgId,async(tx:unknown)=>{const id=crypto.randomUUID(),now=new Date();await(tx as any).$executeRawUnsafe(`INSERT INTO webhook_configs(id,org_id,workspace_id,url,events,secret,created_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,$6,$7)`,id,orgId,workspaceId,data.url,JSON.stringify(data.events),data.secret??null,now);return{id,orgId,workspaceId,url:data.url,events:data.events,secret:data.secret??null,createdAt:now};});}
 async listConfigs(orgId:string,workspaceId:string){assertTenant(orgId);return withTenant(this.prisma as never,orgId,async(tx:unknown)=>{const rows=await(tx as any).$queryRawUnsafe(`SELECT id,org_id AS "orgId",workspace_id AS "workspaceId",url,events,secret,created_at AS "createdAt" FROM webhook_configs WHERE org_id=$1::uuid AND workspace_id=$2::uuid ORDER BY created_at DESC`,orgId,workspaceId);return rows.map((r:any)=>({...r,events:Array.isArray(r.events)?r.events:[]}));});}
 async findConfigById(orgId:string,id:string){assertTenant(orgId);return withTenant(this.prisma as never,orgId,async(tx:unknown)=>{const rows=await(tx as any).$queryRawUnsafe(`SELECT id,org_id AS "orgId",workspace_id AS "workspaceId",url,events,secret,created_at AS "createdAt" FROM webhook_configs WHERE id=$1::uuid AND org_id=$2::uuid`,id,orgId);if(!rows[0])return null;return{...rows[0],events:Array.isArray(rows[0].events)?rows[0].events:[]};});}
 async queueOutboxEvent(orgId:string,eventType:string,aggregateId:string,payload:Record<string,unknown>){assertTenant(orgId);return withTenant(this.prisma as never,orgId,async(tx:unknown)=>{const id=crypto.randomUUID(),now=new Date();await(tx as any).$executeRawUnsafe(`INSERT INTO outbox_events(id,org_id,event_type,aggregate_id,payload,status,attempt_count,next_retry_at,created_at) VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5::jsonb,'pending',0,$6,$6)`,id,orgId,eventType,aggregateId,JSON.stringify(payload),now);return{id,orgId,event_type:eventType,aggregate_id:aggregateId,payload,status:"pending" as const,attempt_count:0,next_retry_at:now,last_error:null,createdAt:now};});}
  async listPendingOutboxEvents(limit=20){
    // Worker: tenant-agnostic, uses privileged connection (no RLS) with FOR UPDATE SKIP LOCKED
    // For memory/test fallback via withTenant, keep simple query when DATABASE_URL missing
    if (!process.env.DATABASE_URL) return [] as OutboxEventEntity[];
    const lim = Math.max(1, Math.min(100, limit));
    // Direct privileged query — bypass RLS for cross-tenant worker
    const rows = await (this.prisma as unknown as { $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<OutboxEventEntity[]> }).$queryRawUnsafe(
      `SELECT id,org_id AS "orgId",event_type,aggregate_id,payload,status,attempt_count,next_retry_at AS "next_retry_at",last_error,created_at AS "createdAt"
       FROM outbox_events
       WHERE status IN ('pending','failed') AND (next_retry_at IS NULL OR next_retry_at <= now())
         AND attempt_count < 5
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      lim
    ).catch(async () => {
      // Fallback when FOR UPDATE not supported in test env
      return (this.prisma as unknown as { $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<OutboxEventEntity[]> }).$queryRawUnsafe(
        `SELECT id,org_id AS "orgId",event_type,aggregate_id,payload,status,attempt_count,next_retry_at AS "next_retry_at",last_error,created_at AS "createdAt"
         FROM outbox_events WHERE status IN ('pending','failed') AND (next_retry_at IS NULL OR next_retry_at <= now()) ORDER BY created_at LIMIT $1`, lim);
    });
    return rows as OutboxEventEntity[];
  }
  async markOutboxEventResult(id:string,status:"delivered"|"failed"|"dead_letter",error?:string){
    // Resolve orgId from event row (privileged, no RLS)
    const rows = await (this.prisma as unknown as { $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<Array<{ orgId: string }>> }).$queryRawUnsafe(`SELECT org_id AS "orgId" FROM outbox_events WHERE id=$1::uuid`, id);
    const orgId = rows[0]?.orgId || process.env.BTA_WORKER_ORG_ID || "00000000-0000-0000-0000-000000000000";
    const attempt = status === "delivered" ? 0 : 1;
    // Use privileged update (no RLS) so worker can update any tenant's row
    await (this.prisma as unknown as { $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<void> }).$executeRawUnsafe(
      `UPDATE outbox_events
       SET status=$1,
           attempt_count=attempt_count+$2,
           last_error=$3,
           next_retry_at=CASE
             WHEN $1='failed' THEN now() + (INTERVAL '1 minute' * POWER(5, LEAST(attempt_count,4)))
             WHEN $1='dead_letter' THEN NULL
             ELSE next_retry_at
           END
       WHERE id=$4::uuid`,
      status, attempt, error ?? null, id
    ).catch(async () => {
      // Fallback with org_id filter when privileged path blocked by RLS
      await (this.prisma as unknown as { $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<void> }).$executeRawUnsafe(
        `UPDATE outbox_events SET status=$1,attempt_count=attempt_count+$2,last_error=$3 WHERE id=$4::uuid AND org_id=$5::uuid`, status, attempt, error ?? null, id, orgId);
    });
  }
}
