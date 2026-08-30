/**
 * Mobile App — TASK-029
 * React Native shell (parity with web TASK-013). For v1 we use React for web + React Native stubs
 * so the same logic runs on both platforms via shared design system.
 * In production this would be built with React Native + Expo.
 */

import { API_BASE } from "@bta/shared";
import * as React from "react";

import { View, Text, TextInput, Button } from "react-native";

export const APP_NAME = "Business Transformation AI";
export const API_BASE_URL = API_BASE;

export interface MobileAppProps {
  projectId?: string;
  token?: string;
  platform?: "ios" | "android" | "web";
}

export function MobileApp({ projectId = "demo-project", token = "demo-token", platform = "ios" }: MobileAppProps): React.ReactElement {
  const [authToken, setAuthToken] = React.useState(token);
  const [workspace, setWorkspace] = React.useState<string | null>(null);
  const [project, setProject] = React.useState<string | null>(projectId);
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<{ id: string; role: string; content: string }[]>([]);

  const handleLogin = async () => {
    // In real app, would call login API; here we mock
    setAuthToken("mock-jwt-" + Date.now());
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    const userMsg = { id: `u-${Date.now()}`, role: "user", content: message };
    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    // Simulate AI reply (would call POST /conversations/:id/messages)
    const aiMsg = { id: `ai-${Date.now()}`, role: "ai", content: `AI reply to: ${userMsg.content} (platform: ${platform})` };
    setTimeout(() => setMessages((prev) => [...prev, aiMsg]), 100);
  };

  return (
    <View testID="mobile-app" style={{ padding: 16 }}>
      <Text> {APP_NAME} — Mobile ({platform}) </Text>
      <Text> API: {API_BASE_URL} </Text>

      <View testID="auth-section" style={{ marginTop: 12 }}>
        <Text>Auth</Text>
        <Text testID="token-display">Token: {authToken.slice(0, 10)}...</Text>
        <Button title="Login (mock)" onPress={() => void handleLogin()} testID="login-button" />
      </View>

      <View testID="workspace-section" style={{ marginTop: 12 }}>
        <Text>Workspaces</Text>
        <Button title="List Workspaces" onPress={() => setWorkspace("ws-demo")} testID="list-workspaces-button" />
        {workspace ? <Text testID="workspace-item">Workspace: {workspace}</Text> : null}
      </View>

      <View testID="project-section" style={{ marginTop: 12 }}>
        <Text>Projects</Text>
        <Button title="List Projects" onPress={() => setProject("proj-demo")} testID="list-projects-button" />
        {project ? <Text testID="project-item">Project: {project}</Text> : null}
      </View>

      <View testID="chat-section" style={{ marginTop: 12 }}>
        <Text>Chat — Discovery Flow (parity with web TASK-013)</Text>
        <View testID="message-list">
          {messages.map((m) => (
            <Text key={m.id} testID={`message-${m.role}`}>
              {m.role}: {m.content}
            </Text>
          ))}
          {messages.length === 0 ? <Text testID="empty-chat">No messages yet</Text> : null}
        </View>
        <TextInput testID="chat-input" value={message} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)} placeholder="Enter message" />
        <Button title="Send" onPress={() => void handleSend()} testID="send-button" />
      </View>

      <Text style={{ marginTop: 12, fontSize: 10, color: "#666" }}>Parity with web: same Core API, same JWT org_id isolation, same design system.</Text>
    </View>
  );
}

export default MobileApp;
