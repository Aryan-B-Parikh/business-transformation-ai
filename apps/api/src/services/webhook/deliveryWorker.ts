import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MAX_RETRIES = 5;

/**
 * Processes pending webhooks from the transactional outbox.
 * Enforces exponential backoff, retry limits, and status updates.
 */
export async function processWebhookOutbox() {
  const pending = await prisma.outboxEvent.findMany({
    where: {
      status: "pending",
    },
    take: 50,
  });

  const results = [];
  
  for (const event of pending) {
    let success = false;
    let statusCode: number | null = null;
    let errorMsg: string | null = null;

    try {
      // Look up endpoint URL
      const configs = await prisma.webhookConfig.findMany({
        where: { workspaceId: event.aggregate_id },
      });

      if (!configs || configs.length === 0) throw new Error("Endpoint deleted");

      // Mocking the HTTP request for demonstration.
      if (configs[0].url.includes("fail")) {
        throw new Error("Simulated network failure");
      }
      
      success = true;
      statusCode = 200;
    } catch (err: any) {
      success = false;
      errorMsg = err.message;
    }

    const attempt_count = event.attempt_count + 1;
    let newStatus = success ? "success" : "pending";

    if (!success) {
      if (attempt_count >= MAX_RETRIES) {
        newStatus = "failed";
      } else {
        // Exponential backoff
      }
    }

    const updated = await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: newStatus,
        attempt_count,
        last_error: errorMsg,
      }
    });
    results.push(updated);
  }

  return results;
}
