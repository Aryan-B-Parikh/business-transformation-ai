import { getRepositories, initializeRepositories } from "../repositories";
import { deliverWebhookHttp } from "../services/webhook/dispatcher";
import { prisma } from "../db/client";
import { PrismaClientType } from "../repositories/postgres";

const MAX_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);
let shuttingDown = false;

// Initialize repositories for postgres backend
initializeRepositories("postgres", prisma as unknown as PrismaClientType);

async function processWebhooks(): Promise<number> {
  const repo = getRepositories().webhooks;
  const events = await repo.listPendingOutboxEvents(MAX_CONCURRENCY);
  let processed = 0;
  // Concurrency-limited batch (sequential for now; replace with p-limit for parallel)
  for (const event of events) {
    if (shuttingDown) break;
    const start = Date.now();
    try {
      const orgId = (event as unknown as { orgId: string }).orgId || (event as unknown as { org_id: string }).org_id;
      // Idempotency: skip if already delivered/dead_letter (race with SKIP LOCKED)
      if ((event as unknown as { status: string }).status === "delivered" || (event as unknown as { status: string }).status === "dead_letter") continue;
      const orgConfigs = await (prisma as unknown as { $queryRawUnsafe: (s: string, ...a: unknown[]) => Promise<Array<{ events: string[]; url: string; secret?: string; id: string; workspace_id?: string }>> }).$queryRawUnsafe(`SELECT id, url, events, secret FROM webhook_configs WHERE org_id = $1::uuid`, orgId).catch(() => [] as Array<{ events: string[]; url: string }>);
      let delivered = false;
      let lastError: string | null = null;
      let matched = 0;
      for (const config of orgConfigs) {
        const evts = Array.isArray(config.events) ? config.events : [];
        if (evts.includes(event.event_type) || evts.includes("*")) {
          matched++;
          const res = await deliverWebhookHttp(config as unknown as { url: string; secret?: string; id: string }, event.event_type, event.payload as unknown as Record<string, unknown>);
          if (!res.success) lastError = res.error || "delivery failed";
          else delivered = true;
        }
      }
      if (matched === 0) {
        // No configs matched → delivered (no-op), audit
        await repo.markOutboxEventResult(event.id, "delivered");
      } else if (delivered) {
        await repo.markOutboxEventResult(event.id, "delivered");
      } else {
        const attempt = (event as unknown as { attempt_count: number }).attempt_count ?? 0;
        const nextStatus = attempt >= 4 ? "dead_letter" as const : "failed" as const;
        await repo.markOutboxEventResult(event.id, nextStatus, lastError || "all deliveries failed");
      }
      processed++;
      const dur = Date.now() - start;
      // Observability: webhook latency hist (reuse metrics if available)
      try { const { observeHistogram } = await import("../utils/metrics"); observeHistogram("webhook_delivery_latency_ms", dur); } catch { /* ignore */ }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to process outbox event ${event.id}:`, msg);
      await repo.markOutboxEventResult(event.id, (event as unknown as { attempt_count: number }).attempt_count >= 4 ? "dead_letter" : "failed", msg).catch(() => undefined);
    }
  }
  return processed;
}

async function startWorkers(): Promise<NodeJS.Timeout> {
  console.log(`Starting BTA Durable Workers (concurrency=${MAX_CONCURRENCY}, interval=5s)…`);
  const timer = setInterval(() => {
    if (shuttingDown) return;
    processWebhooks().catch(e => console.error("Webhook worker error:", e));
  }, 5000);
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[workers] ${signal} received — draining`);
    clearInterval(timer);
    // Allow in-flight to settle
    await new Promise(r => setTimeout(r, 1000));
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  return timer;
}

export { processWebhooks, startWorkers };

if (require.main === module) {
  startWorkers();
}
