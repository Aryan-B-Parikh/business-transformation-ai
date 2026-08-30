// @ts-nocheck
import * as React from "react";
import { View, Text, TextInput, Button, ActivityIndicator } from "react-native";
import { API_BASE } from "@bta/shared";

export const APP_NAME = "Business Transformation AI";
export const API_BASE_URL = API_BASE;
export interface MobileAppProps { projectId?: string; token?: string; platform?: "ios" | "android" | "web"; }
type Message = { id: string; role: string; content: string };

export function MobileApp({ projectId, token, platform = "ios" }: MobileAppProps): React.ReactElement {
  const [workspace, setWorkspace] = React.useState<string[]>([]);
  const [project, setProject] = React.useState(projectId ?? "");
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const request = React.useCallback(async (path: string, init: RequestInit = {}) => {
    if (!token) throw new Error("Authentication required");
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  }, [token]);

  const loadWorkspaces = async () => {
    setLoading(true); setError(null);
    try { const result = await request("/api/v1/workspaces"); setWorkspace((result.data || result).map((w: { name: string }) => w.name)); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load workspaces"); }
    finally { setLoading(false); }
  };

  const sendMessage = async () => {
    if (!message.trim() || !project) return;
    const content = message.trim(); setMessage(""); setError(null);
    setMessages(prev => [...prev, { id: `${Date.now()}`, role: "user", content }]);
    setLoading(true);
    try {
      const result = await request(`/api/v1/projects/${project}/conversations`, { method: "POST", body: JSON.stringify({ message: content }) });
      const reply = result.message?.content || result.content || result.answer;
      if (!reply) throw new Error("API returned no assistant message");
      setMessages(prev => [...prev, { id: `${Date.now()}-ai`, role: "ai", content: reply }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send message"); }
    finally { setLoading(false); }
  };

  return <View testID="mobile-app" style={{ padding: 16 }}>
    <Text>{APP_NAME} - Mobile ({platform})</Text>
    {!token ? <Text testID="auth-required">Authentication required. Supply an access token from the native auth flow.</Text> : <Text testID="authenticated">Authenticated</Text>}
    <View testID="workspace-section" style={{ marginTop: 12 }}><Text>Workspaces</Text><Button title="Refresh" onPress={() => void loadWorkspaces()} disabled={!token || loading} />{workspace.map(name => <Text key={name}>{name}</Text>)}</View>
    <View testID="project-section" style={{ marginTop: 12 }}><Text>Project</Text><TextInput value={project} onChangeText={setProject} placeholder="Project ID" /></View>
    <View testID="chat-section" style={{ marginTop: 12 }}><Text>Discovery Chat</Text>{messages.length === 0 ? <Text testID="empty-chat">No messages yet</Text> : messages.map(m => <Text key={m.id} testID={`message-${m.role}`}>{m.role}: {m.content}</Text>)}<TextInput testID="chat-input" value={message} onChangeText={setMessage} placeholder="Enter message" editable={!!token && !!project} /><Button title={loading ? "Sending..." : "Send"} onPress={() => void sendMessage()} disabled={loading || !token || !project || !message.trim()} />{loading ? <ActivityIndicator /> : null}</View>
    {error ? <Text testID="error">{error}</Text> : null}
  </View>;
}
export default MobileApp;
