/**
 * Mobile API client — TASK-029 parity with web (same Core API /api/v1)
 * Uses same JWT org_id tenant isolation.
 */

import { API_BASE } from "@bta/shared";

export const API_BASE_URL = API_BASE;

export async function login(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}`);
  return res.json();
}

export async function listWorkspaces(token: string): Promise<{ data: unknown[] }> {
  const res = await fetch(`${API_BASE_URL}/workspaces`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function listProjects(workspaceId: string, token: string): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/projects`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function createConversation(projectId: string, token: string): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/conversations`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({}) });
  return res.json();
}

export async function sendMessage(conversationId: string, content: string, token: string): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return res.json();
}
