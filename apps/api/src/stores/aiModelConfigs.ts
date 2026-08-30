/**
 * AI Model configs store — TASK-028
 * Per-tenant AI model selection
 */

export interface AiModelConfig {
  id: string;
  orgId: string;
  module: string;
  provider: string;
  modelName: string;
  enabled: boolean;
}

const configs = new Map<string, AiModelConfig>(); // key: ${orgId}:${module}

function key(orgId: string, module: string): string {
  return `${orgId}:${module}`;
}

export function clearAiModelConfigs(): void {
  configs.clear();
}

export function seedDefaultConfigs(orgId: string): void {
  const defaults: Omit<AiModelConfig, "id">[] = [
    { orgId, module: "discovery-agent", provider: "openai", modelName: "gpt-4o", enabled: true },
    { orgId, module: "business-analyst-agent", provider: "openai", modelName: "gpt-4o", enabled: true },
    { orgId, module: "architecture-agent", provider: "openai", modelName: "gpt-4o", enabled: true },
    { orgId, module: "process-agent", provider: "openai", modelName: "gpt-4o", enabled: true },
    { orgId, module: "ux-agent", provider: "openai", modelName: "gpt-4o", enabled: true },
    { orgId, module: "data-modeling-agent", provider: "openai", modelName: "gpt-4o", enabled: true },
    { orgId, module: "planning-agent", provider: "openai", modelName: "gpt-4o", enabled: true },
  ];
  for (const c of defaults) {
    const id = `${c.orgId}:${c.module}`;
    configs.set(key(c.orgId, c.module), { ...c, id });
  }
}

export function listAiModelConfigs(orgId: string): AiModelConfig[] {
  const out: AiModelConfig[] = [];
  for (const [k, v] of configs.entries()) if (k.startsWith(`${orgId}:`)) out.push(v);
  // Seed if empty
  if (out.length === 0) {
    seedDefaultConfigs(orgId);
    return listAiModelConfigs(orgId);
  }
  return out;
}

export function getAiModelConfig(orgId: string, module: string): AiModelConfig | undefined {
  return configs.get(key(orgId, module));
}

export function updateAiModelConfig(orgId: string, module: string, updates: Partial<AiModelConfig>): AiModelConfig | undefined {
  const existing = configs.get(key(orgId, module));
  if (!existing) return undefined;
  const updated = { ...existing, ...updates, orgId, module };
  configs.set(key(orgId, module), updated);
  return updated;
}
