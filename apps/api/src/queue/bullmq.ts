/**
 * Queue abstraction — BullMQ with Redis when REDIS_URL set, else in-memory fallback (tests/dev).
 * Used for blueprint generation <3m p95 (AUDIT §17). Jobs: ai-generate, export, webhook.
 */

type JobHandler = (data: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();
const memoryQueue: Array<{ name: string; data: Record<string, unknown> }> = [];

export function registerHandler(name: string, fn: JobHandler): void { handlers.set(name, fn); }

export async function enqueue(name: string, data: Record<string, unknown>): Promise<{ id: string }> {
  const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (process.env.REDIS_URL) {
    // Real BullMQ: lazy import to keep dev without redis
    try {
      const { Queue } = await import("bullmq");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = new (Queue as any)(name, { connection: { url: process.env.REDIS_URL } });
      await q.add(name, data, { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 50 });
      return { id };
    } catch { /* fallback */ }
  }
  memoryQueue.push({ name, data });
  // Drain async (fire-and-forget, mimics worker)
  setImmediate(async () => {
    const h = handlers.get(name);
    if (h) await h(data).catch(() => undefined);
  });
  return { id };
}

export function getMemoryQueue(): typeof memoryQueue { return memoryQueue; }
export function clearMemoryQueue(): void { memoryQueue.length = 0; }
