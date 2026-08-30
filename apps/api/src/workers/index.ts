import { getRepositories } from "../repositories";
import { deliverWebhookHttp } from "../services/webhook/dispatcher";
import { prisma } from "../db/client";

async function processWebhooks() {
  const repo = getRepositories().webhooks;
  const events = await repo.listPendingOutboxEvents(10);
  for (const event of events) {
    try {
      const orgId = event.orgId;
      // We don't have webhook config id in event, but we can look up configs by orgId that match the event_type
      const orgConfigs = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM webhook_configs WHERE org_id = $1::uuid`, orgId);
      let delivered = false;
      let lastError = null;

      for (const config of orgConfigs) {
        // Just mock matching for now, in real life events jsonb would be checked
        if (config.events.includes(event.event_type) || config.events.includes("*")) {
          const res = await deliverWebhookHttp(config, event.event_type, event.payload as any);
          if (!res.success) {
            lastError = res.error;
          } else {
            delivered = true;
          }
        }
      }

      if (delivered) {
        await repo.markOutboxEventResult(event.id, "delivered");
      } else if (lastError) {
        await repo.markOutboxEventResult(event.id, event.attempt_count >= 4 ? "dead_letter" : "failed", lastError);
      } else {
        // No configs matched, mark delivered
        await repo.markOutboxEventResult(event.id, "delivered");
      }
    } catch (e: any) {
      console.error(`Failed to process outbox event ${event.id}:`, e);
      await repo.markOutboxEventResult(event.id, "failed", e.message);
    }
  }
}

async function startWorkers() {
  console.log("Starting BTA Durable Workers...");
  setInterval(() => {
    processWebhooks().catch(e => console.error("Webhook worker error:", e));
  }, 5000);
}

if (require.main === module) {
  startWorkers();
}
