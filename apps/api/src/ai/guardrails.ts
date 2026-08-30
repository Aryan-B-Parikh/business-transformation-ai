export class AIValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIValidationError";
  }
}

/**
 * Detects common LLM prompt injection payloads.
 * Blocks "ignore previous instructions", "system override", etc.
 */
export function detectPromptInjection(input: string): void {
  if (!input) return;
  const normalized = input.toLowerCase();

  const injectionSignatures = [
    "ignore previous instructions",
    "ignore all previous instructions",
    "system override",
    "disregard previous",
    "you are now",
    "forget everything",
    "new instructions:",
  ];

  for (const sig of injectionSignatures) {
    if (normalized.includes(sig)) {
      throw new AIValidationError("Malicious prompt injection detected.");
    }
  }
}

/**
 * Scans user inputs that might be forwarded to an LLM to prevent SSRF or data exfiltration.
 * Blocks internal IPs (e.g. 127.0.0.1, 169.254.169.254) from being passed to the LLM.
 */
export function detectSSRFInInput(input: string): void {
  if (!input) return;

  // Regex to match forbidden IPs or local hostnames
  const forbiddenPatterns = [
    /(?:https?:\/\/)?127\.0\.0\.1/i,
    /(?:https?:\/\/)?localhost/i,
    /(?:https?:\/\/)?169\.254\.169\.254/i,
    /(?:https?:\/\/)?10\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
    /(?:https?:\/\/)?192\.168\.\d{1,3}\.\d{1,3}/i,
    /(?:https?:\/\/)?172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}/i,
    /(?:https?:\/\/)?0\.0\.0\.0/i,
    /internal\.api/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(input)) {
      throw new AIValidationError("SSRF payload detected in LLM input.");
    }
  }
}
