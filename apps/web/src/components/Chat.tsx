/**
 * Chat — TASK-013
 * React chat UI for conversations + discovery (04_API_SPEC.md § Conversations)
 * Features: conversation creation, message list, input, AI reply, discovery summary view
 */

import * as React from "react";
import { createConversation, getConversation, sendMessage } from "../api/client";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  createdAt: string;
}

export interface ChatProps {
  projectId: string;
  token: string;
  onDiscoverySummary?: (summary: unknown) => void;
}

export function Chat({ projectId, token, onDiscoverySummary }: ChatProps): React.ReactElement {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const startConversation = React.useCallback(async () => {
    try {
      const conv = await createConversation(projectId, token);
      setConversationId(conv.id);
      setMessages([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId, token]);

  React.useEffect(() => {
    void startConversation();
  }, [startConversation]);

  const handleSend = async () => {
    if (!input.trim() || !conversationId) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    // Optimistic user message
    const tempUser: ChatMessage = { id: `temp-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUser]);
    try {
      const res = await sendMessage(conversationId, content, token);
      const aiMsg = (res.aiMessage as ChatMessage) || { id: `ai-${Date.now()}`, role: "ai" as const, content: JSON.stringify(res.aiResult), createdAt: new Date().toISOString() };
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUser.id), res.userMessage as ChatMessage, aiMsg]);
      // If AI result is summary, surface discovery summary
      const aiResult = res.aiResult as { type?: string; structured?: unknown; summary?: string };
      if (aiResult?.type === "summary") {
        onDiscoverySummary?.(aiResult);
      }
      // Also refresh full conversation to ensure persistence
      const conv = (await getConversation(conversationId, token)) as { messages?: ChatMessage[] };
      if (conv.messages) setMessages(conv.messages);
    } catch (e) {
      setError((e as Error).message);
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div data-testid="chat">
      <h3>AI Transformation Companion</h3>
      {!conversationId ? (
        <p>Starting conversation...</p>
      ) : (
        <>
          <div data-testid="message-list" style={{ border: "1px solid #ccc", minHeight: 200, padding: 8, marginBottom: 8 }}>
            {messages.length === 0 ? (
              <p data-testid="empty">No messages yet. Start the discovery!</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} data-testid={`message-${m.role}`} style={{ margin: "4px 0", textAlign: m.role === "user" ? "right" : "left" }}>
                  <strong>{m.role}:</strong> {m.content}
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              aria-label="Chat input"
              data-testid="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your business idea, goals, challenges..."
              disabled={sending}
              style={{ flex: 1 }}
            />
            <button data-testid="send-button" onClick={() => void handleSend()} disabled={sending || !input.trim()}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          {error && <p role="alert" data-testid="chat-error">{error}</p>}
        </>
      )}
    </div>
  );
}

export default Chat;
