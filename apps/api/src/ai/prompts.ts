import { z } from "zod";

/**
 * Builds a strict system prompt combining a base instruction and schema constraints.
 * Enforces JSON output and provides guardrails against markdown wrapping.
 */
export function buildSystemPrompt(basePrompt: string, schema?: z.ZodTypeAny, language?: string): string {
  let prompt = basePrompt.trim();
  
  if (language && language !== "en") {
    prompt += `\n\nLANGUAGE INSTRUCTION: All analytical content, descriptions, summaries, and textual explanations must be generated in '${language}'.`;
  }

  if (schema) {
    prompt += `\n\nCRITICAL INSTRUCTION: You must respond ONLY with valid JSON matching the expected schema. Do not include markdown formatting (like \`\`\`json), explanations, or conversational text. Adhere exactly to the schema structure.`;
  } else {
    prompt += `\n\nCRITICAL INSTRUCTION: You must respond ONLY with valid JSON. Do not include markdown formatting or explanations.`;
  }

  return prompt;
}
