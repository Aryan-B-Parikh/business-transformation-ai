/**
 * API client — TASK-013
 * Wraps Core API per 04_API_SPEC.md § Workspaces & Projects + Documents & Conversations
 */

import { API_BASE } from "@bta/shared";

export const API_BASE_URL = API_BASE;

export interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  return res;
}

// Auth
export async function login(email: string, password: string): Promise<{ token: string; user: unknown }> {
  const res = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`Login failed ${res.status}`);
  return res.json();
}

// Workspaces
export async function listWorkspaces(token: string): Promise<unknown> {
  const res = await apiFetch("/workspaces", { token });
  return res.json();
}

// Documents
export async function uploadDocument(projectId: string, file: File, token: string): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`/projects/${projectId}/documents?sync=true`, { method: "POST", body: form, token });
  if (!res.ok) throw new Error(`Upload failed ${res.status}`);
  return res.json();
}

// Conversations
export async function createConversation(projectId: string, token: string): Promise<{ id: string }> {
  const res = await apiFetch(`/projects/${projectId}/conversations`, { method: "POST", token, body: JSON.stringify({}) });
  if (!res.ok) throw new Error("Create conversation failed");
  return res.json();
}
export async function sendMessage(conversationId: string, content: string, token: string): Promise<{ userMessage: unknown; aiMessage: unknown; aiResult: unknown }> {
  const res = await apiFetch(`/conversations/${conversationId}/messages`, { method: "POST", token, body: JSON.stringify({ content }) });
  if (!res.ok) throw new Error("Send message failed");
  return res.json();
}
export async function getConversation(conversationId: string, token: string): Promise<unknown> {
  const res = await apiFetch(`/conversations/${conversationId}`, { token });
  return res.json();
}

// Artifacts
export async function listArtifacts(projectId: string, token: string): Promise<any> {
  const res = await apiFetch(`/projects/${projectId}/artifacts`, { token });
  if (!res.ok) throw new Error("List artifacts failed");
  return res.json();
}

export async function getArtifact(artifactId: string, token: string): Promise<any> {
  const res = await apiFetch(`/artifacts/${artifactId}`, { token });
  if (!res.ok) throw new Error("Get artifact failed");
  return res.json();
}

export async function updateArtifact(artifactId: string, updates: any, token: string): Promise<any> {
  const res = await apiFetch(`/artifacts/${artifactId}`, { method: "PATCH", token, body: JSON.stringify(updates) });
  if (!res.ok) throw new Error("Update artifact failed");
  return res.json();
}

// Journey & Dashboard
export async function getJourneyState(projectId: string, token: string): Promise<any> {
  const res = await apiFetch(`/projects/${projectId}/journey`, { token });
  if (!res.ok) throw new Error("Get journey state failed");
  return res.json();
}

export async function getProjectActivity(projectId: string, token: string): Promise<any> {
  const res = await apiFetch(`/projects/${projectId}/activity`, { token });
  if (!res.ok) throw new Error("Get project activity failed");
  return res.json();
}
