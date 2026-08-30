/**
 * Conversation store — TASK-009
 * Mirrors conversations + conversation_messages tables (03_DATA_MODEL.md)
 * Tenant-isolated by org_id + projectId
 */

import { v4 as uuidv4 } from "uuid";

export type MessageRole = "user" | "ai";

export interface Conversation {
  id: string;
  projectId: string;
  orgId: string;
  startedBy: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  orgId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

const conversations = new Map<string, Conversation>();
const messages = new Map<string, ConversationMessage[]>(); // conversationId -> messages
const byProject = new Map<string, Set<string>>(); // projectId -> conv ids

export function clearConversations(): void {
  conversations.clear();
  messages.clear();
  byProject.clear();
}

export function createConversation(projectId: string, orgId: string, startedBy: string): Conversation {
  const c: Conversation = {
    id: uuidv4(),
    projectId,
    orgId,
    startedBy,
    createdAt: new Date().toISOString(),
  };
  conversations.set(c.id, c);
  messages.set(c.id, []);
  if (!byProject.has(projectId)) byProject.set(projectId, new Set());
  byProject.get(projectId)!.add(c.id);
  return c;
}

export function getConversation(id: string): Conversation | undefined {
  return conversations.get(id);
}

export function listConversationsByProject(projectId: string, orgId: string): Conversation[] {
  const ids = byProject.get(projectId);
  if (!ids) return [];
  const out: Conversation[] = [];
  for (const id of ids) {
    const c = conversations.get(id);
    if (c && c.orgId === orgId) out.push(c);
  }
  return out;
}

export function addMessage(conversationId: string, orgId: string, role: MessageRole, content: string): ConversationMessage {
  const conv = conversations.get(conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (conv.orgId !== orgId) throw new Error("Cross-tenant");
  const m: ConversationMessage = {
    id: uuidv4(),
    conversationId,
    orgId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
  const list = messages.get(conversationId) || [];
  list.push(m);
  messages.set(conversationId, list);
  return m;
}

export function getMessages(conversationId: string, orgId: string): ConversationMessage[] {
  const conv = conversations.get(conversationId);
  if (!conv || conv.orgId !== orgId) return [];
  return [...(messages.get(conversationId) || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getConversationWithMessages(id: string, orgId: string): (Conversation & { messages: ConversationMessage[] }) | undefined {
  const c = conversations.get(id);
  if (!c || c.orgId !== orgId) return undefined;
  return { ...c, messages: getMessages(id, orgId) };
}
