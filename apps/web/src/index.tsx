/**
 * @bta/web — Web frontend entry
 * React + TypeScript (02 §7). Mobile parity deferred per PRD §3 roadmap.
 */

import { API_BASE } from "@bta/shared";

export const APP_NAME = "Business Transformation AI";
export const API_BASE_URL = API_BASE;

export interface AppConfig {
  appName: string;
  apiBase: string;
  version: string;
}

export function getAppConfig(): AppConfig {
  return { appName: APP_NAME, apiBase: API_BASE_URL, version: "0.1.0" };
}

// Re-export App for consumption
export { App } from "./App";
export { Chat } from "./components/Chat";
export { DocumentUpload } from "./components/DocumentUpload";
export { DiscoverySummary } from "./components/DiscoverySummary";

// Minimal view string for legacy callers (TASK-001)
export function AppString(): string {
  const cfg = getAppConfig();
  return `${cfg.appName} v${cfg.version} — API: ${cfg.apiBase}`;
}

if (require.main === module) {
  console.log(AppString());
}
