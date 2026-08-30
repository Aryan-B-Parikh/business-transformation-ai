import crypto from "crypto";
import { validateSafeWebhookUrl } from "./ssrfGuard";
import { WebhookConfig } from "../../stores/webhooks";

export interface OutboxDeliveryResult { success: boolean; statusCode?: number; error?: string; }

export async function deliverWebhookHttp(config: WebhookConfig, event: string, payload: Record<string, unknown>, secret?: string): Promise<OutboxDeliveryResult> {
  const signingSecret = secret || config.secret || process.env.WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) return { success: false, error: "WEBHOOK_SECRET_NOT_CONFIGURED" };
  let target = config.url;
  if (!(await validateSafeWebhookUrl(target))) return { success: false, error: "BLOCKED_SSRF: destination is restricted or invalid" };

  const timestamp = Date.now().toString();
  const serializedBody = JSON.stringify({ event, webhookId: config.id, workspaceId: config.workspaceId, timestamp, data: payload });
  const signature = crypto.createHmac("sha256", signingSecret).update(`${timestamp}.${serializedBody}`).digest("hex");
  const headers = { "Content-Type": "application/json", "User-Agent": "Business-Transformation-AI-Webhook/1.0", "X-BTA-Signature-256": `t=${timestamp},v1=${signature}`, "X-BTA-Event": event };

  try {
    for (let redirect = 0; redirect <= 3; redirect++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(target, { method: "POST", headers, body: serializedBody, signal: controller.signal, redirect: "manual" });
      } finally { clearTimeout(timeout); }
      if (![301, 302, 303, 307, 308].includes(response.status)) return { success: response.ok, statusCode: response.status, error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}` };
      if (redirect === 3) return { success: false, statusCode: response.status, error: "REDIRECT_LIMIT_EXCEEDED" };
      const location = response.headers.get("location");
      if (!location) return { success: false, statusCode: response.status, error: "REDIRECT_WITHOUT_LOCATION" };
      target = new URL(location, target).toString();
      if (!(await validateSafeWebhookUrl(target))) return { success: false, statusCode: response.status, error: "BLOCKED_SSRF: redirect destination is restricted" };
    }
    return { success: false, error: "REDIRECT_FAILED" };
  } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
}
