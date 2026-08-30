import { ZodSchema } from "zod";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
}

/**
 * Validates raw AI output against a Zod schema with an automated simulated repair loop.
 */
export function validateAndRepairAIOutput<T>(
  schema: ZodSchema<T>,
  rawOutput: unknown,
  repairPromptFn?: (errMessage: string) => unknown,
  maxAttempts = 2
): ValidationResult<T> {
  let currentPayload = rawOutput;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const parsed = schema.safeParse(currentPayload);
    if (parsed.success) {
      return {
        success: true,
        data: parsed.data,
        attempts,
      };
    }

    if (repairPromptFn && attempts < maxAttempts) {
      currentPayload = repairPromptFn(parsed.error.message);
    }
  }

  const finalCheck = schema.safeParse(currentPayload);
  return {
    success: finalCheck.success,
    data: finalCheck.success ? finalCheck.data : undefined,
    error: finalCheck.success ? undefined : finalCheck.error.message,
    attempts,
  };
}
