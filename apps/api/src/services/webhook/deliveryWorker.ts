import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MAX_RETRIES = 5;

/**
 * Processes pending webhooks from the transactional outbox.
 * Enforces exponential backoff, retry limits, and status updates.
 */
export async function processWebhookOutbox() {
  const pending = await prisma.webhookDeliveryOutbox.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: new Date() },
    },
    take: 50,
  });

  const results = [];
  
  for (const delivery of pending) {
    let success = false;
    let statusCode: number | null = null;
    let errorMsg: string | null = null;

    try {
      // Look up endpoint URL
      const endpoint = await prisma.webhookEndpoint.findUnique({
        where: { id: delivery.endpointId }
      });

      if (!endpoint) throw new Error("Endpoint deleted");

      // In production, we'd use `fetch` with the payload.
      // Mocking the HTTP request for demonstration.
      if (endpoint.url.includes("fail")) {
        throw new Error("Simulated network failure");
      }
      
      success = true;
      statusCode = 200;
    } catch (err: any) {
      success = false;
      errorMsg = err.message;
    }

    const attempts = delivery.attempts + 1;
    let newStatus = success ? "success" : "pending";
    let nextAttemptAt = delivery.nextAttemptAt;

    if (!success) {
      if (attempts >= MAX_RETRIES) {
        newStatus = "failed";
      } else {
        // Exponential backoff: 2^attempts * 10 seconds
        const delaySeconds = Math.pow(2, attempts) * 10;
        nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
      }
    }

    const updated = await prisma.webhookDeliveryOutbox.update({
      where: { id: delivery.id },
      data: {
        status: newStatus,
        attempts,
        lastAttemptAt: new Date(),
        nextAttemptAt,
        statusCode,
        errorMessage: errorMsg,
      }
    });
    results.push(updated);
  }

  return results;
}
