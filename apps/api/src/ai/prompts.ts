import { z } from "zod";

/**
 * Builds a strict system prompt combining a base instruction and schema constraints.
 * Enforces JSON output and provides guardrails against markdown wrapping.
 */
export function buildSystemPrompt(basePrompt: string, schema?: z.ZodTypeAny): string {
  let prompt = basePrompt.trim();
  
  if (schema) {
    // In production, we could convert Zod to JSON Schema here.
    // For now, we enforce a strict directive.
    prompt += `\n\nCRITICAL INSTRUCTION: You must respond ONLY with valid JSON matching the expected schema. Do not include markdown formatting (like \`\`\`json), explanations, or conversational text. Adhere exactly to the schema structure.`;
  } else {
    prompt += `\n\nCRITICAL INSTRUCTION: You must respond ONLY with valid JSON. Do not include markdown formatting or explanations.`;
  }

  return prompt;
}
