import { getRepositories } from "../../repositories";
import crypto from "crypto";
import { validateSafeWebhookUrl } from "./ssrfGuard";


export interface OutboxDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function deliverWebhookHttp(
  config: any,
  event: string,
  payload: Record<string, unknown>,
  secret: string = process.env.WEBHOOK_SIGNING_SECRET || "default_webhook_secret_key_32_bytes_min"
): Promise<OutboxDeliveryResult> {
  const isSafe = await validateSafeWebhookUrl(config.url);
  if (!isSafe) {
    return {
      success: false,
      error: "BLOCKED_SSRF: Destination URL resolves to restricted private IP or invalid address",
    };
  }

  const timestamp = Date.now().toString();
  const serializedBody = JSON.stringify({
    event,
    webhookId: config.id,
    workspaceId: config.workspaceId,
    timestamp,
    data: payload,
  });

  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${serializedBody}`)
    .digest("hex");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Business-Transformation-AI-Webhook/1.0",
        "X-BTA-Signature-256": `t=${timestamp},v1=${signature}`,
        "X-BTA-Event": event,
      },
      body: serializedBody,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
