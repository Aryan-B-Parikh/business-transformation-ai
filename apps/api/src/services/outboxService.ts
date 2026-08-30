/**
 * Outbox Service (Phase 4 / Phase 16)
 * Atomic domain state mutation and outbox event creation.
 */

import { getRepositories } from "../repositories";
import { deliverWebhookHttp } from "./webhook/dispatcher";

export interface DomainEvent<T = Record<string, unknown>> {
  eventType: string;
  aggregateId: string;
  orgId: string;
  payload: T;
}

export class OutboxService {
  /**
   * Dispatches pending outbox events asynchronously with retries and dead-letter handling.
   */
  static async processPendingEvents(batchSize = 20): Promise<{ processed: number; succeeded: number; failed: number }> {
    const repos = getRepositories();
    const pending = await repos.webhooks.listPendingOutboxEvents(batchSize);

    let succeeded = 0;
    let failed = 0;

    for (const event of pending) {
      // Find configs registered for this org and event
      // Deliver via dispatcher
      const configs = await repos.webhooks.listConfigs(event.org_id, event.aggregate_id);
      let eventSuccess = true;

      for (const cfg of configs) {
        if (cfg.events.includes(event.event_type) || cfg.events.includes("*")) {
          const result = await deliverWebhookHttp(
            {
              id: cfg.id,
              workspaceId: cfg.workspace_id,
              orgId: cfg.org_id,
              url: cfg.url,
              events: cfg.events,
              createdAt: cfg.created_at.toISOString(),
            },
            event.event_type,
            event.payload,
            cfg.secret || undefined
          );

          if (!result.success) {
            eventSuccess = false;
          }
        }
      }

      if (eventSuccess) {
        await repos.webhooks.markOutboxEventResult(event.id, "delivered");
        succeeded++;
      } else {
        const nextStatus = event.attempt_count >= 5 ? "dead_letter" : "failed";
        await repos.webhooks.markOutboxEventResult(event.id, nextStatus, "Delivery failed after attempt " + (event.attempt_count + 1));
        failed++;
      }
    }

    return { processed: pending.length, succeeded, failed };
  }
}
