/**
 * Webhook store — TASK-027
 * Outbound webhook config per workspace
 */

import { v4 as uuidv4 } from "uuid";

export interface WebhookConfig {
  id: string;
  workspaceId: string;
  orgId: string;
  url: string;
  events: string[]; // e.g., ["artifact.created", "artifact.approved"]
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  orgId: string;
  event: string;
  payload: Record<string, unknown>;
  deliveredAt: string;
  success: boolean;
}

const configs = new Map<string, WebhookConfig>();
const byWorkspace = new Map<string, Set<string>>();
const deliveries: WebhookDelivery[] = [];

export function clearWebhooks(): void {
  configs.clear();
  byWorkspace.clear();
  deliveries.length = 0;
}

export function createWebhookConfig(c: Omit<WebhookConfig, "id" | "createdAt">): WebhookConfig {
  const id = uuidv4();
  const created: WebhookConfig = { ...c, id, createdAt: new Date().toISOString() };
  configs.set(id, created);
  if (!byWorkspace.has(c.workspaceId)) byWorkspace.set(c.workspaceId, new Set());
  byWorkspace.get(c.workspaceId)!.add(id);
  return created;
}

export function listWebhookConfigs(workspaceId: string, orgId: string): WebhookConfig[] {
  const ids = byWorkspace.get(workspaceId);
  if (!ids) return [];
  const out: WebhookConfig[] = [];
  for (const id of ids) {
    const r = configs.get(id);
    if (r && r.orgId === orgId) out.push(r);
  }
  return out;
}

export function getWebhookConfig(id: string): WebhookConfig | undefined {
  return configs.get(id);
}

export function triggerWebhooks(workspaceId: string, orgId: string, event: string, payload: Record<string, unknown>): WebhookDelivery[] {
  const cfgs = listWebhookConfigs(workspaceId, orgId).filter((c) => c.events.includes(event) || c.events.includes("*"));
  const results: WebhookDelivery[] = [];
  for (const cfg of cfgs) {
    // In real system, would POST to cfg.url. Here we simulate delivery by storing.
    const delivery: WebhookDelivery = {
      id: uuidv4(),
      webhookId: cfg.id,
      orgId,
      event,
      payload,
      deliveredAt: new Date().toISOString(),
      success: true,
    };
    deliveries.push(delivery);
    results.push(delivery);
  }
  return results;
}

export function getDeliveries(): WebhookDelivery[] {
  return [...deliveries];
}

export function getDeliveriesForWebhook(webhookId: string): WebhookDelivery[] {
  return deliveries.filter((d) => d.webhookId === webhookId);
}
