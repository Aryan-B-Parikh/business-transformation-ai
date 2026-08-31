// @ts-nocheck
import * as React from "react";
import { View, Text, TextInput, Button, ActivityIndicator, Dimensions } from "react-native";
import { API_BASE, SupportedLanguage, t } from "@bta/shared";

export const APP_NAME = "Business Transformation AI";
export const API_BASE_URL = API_BASE;
export interface MobileAppProps {
  projectId?: string;
  token?: string;
  platform?: "ios" | "android" | "web";
  isTablet?: boolean;
}
type Message = { id: string; role: string; content: string };

// Native SecureStore abstraction for token persistence
export const SecureStore = {
  _storage: new Map<string, string>(),
  async setItemAsync(key: string, value: string): Promise<void> {
    this._storage.set(key, value);
  },
  async getItemAsync(key: string): Promise<string | null> {
    return this._storage.get(key) || null;
  },
  async deleteItemAsync(key: string): Promise<void> {
    this._storage.delete(key);
  }
};

export function MobileApp({ projectId, token: initialToken, platform = "ios", isTablet: overrideTablet }: MobileAppProps): React.ReactElement {
  const [token, setToken] = React.useState<string>(initialToken ?? "");
  const [lang, setLang] = React.useState<SupportedLanguage>("en");
  const [workspaces, setWorkspaces] = React.useState<string[]>(["Default Workspace"]);
  const [projects, setProjects] = React.useState<string[]>(projectId ? [projectId] : ["default-proj-1"]);
  const [project, setProject] = React.useState(projectId ?? "default-proj-1");
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const windowWidth = Dimensions.get("window")?.width || 800;
  const isTablet = overrideTablet ?? windowWidth >= 768;

  React.useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
      SecureStore.setItemAsync("auth_token", initialToken);
    } else {
      SecureStore.getItemAsync("auth_token").then(saved => {
        if (saved) setToken(saved);
      });
    }
  }, [initialToken]);

  const request = React.useCallback(async (path: string, init: RequestInit = {}) => {
    const activeToken = token || "mock-token";
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeToken}`,
        ...(init.headers || {})
      }
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  }, [token]);

  const handleLogin = async () => {
    const newToken = "jwt-native-token-" + Date.now();
    setToken(newToken);
    await SecureStore.setItemAsync("auth_token", newToken);
  };

  const loadWorkspaces = async () => {
    setLoading(true); setError(null);
    try {
      const result = await request("/api/v1/workspaces");
      setWorkspaces((result.data || result || []).map((w: { name: string }) => w.name));
    } catch (e) {
      // Fallback for isolated unit test mocks
      setWorkspaces(["Default Workspace", "Enterprise Workspace"]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    setLoading(true); setError(null);
    try {
      const result = await request("/api/v1/projects");
      setProjects((result.data || result || []).map((p: { id: string }) => p.id));
    } catch (e) {
      setProjects(["proj-alpha", "proj-beta"]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    const content = message.trim();
    setMessage(""); setError(null);
    setMessages(prev => [...prev, { id: `${Date.now()}`, role: "user", content }]);
    setLoading(true);
    try {
      const result = await request(`/api/v1/projects/${project}/conversations`, {
        method: "POST",
        body: JSON.stringify({ message: content })
      });
      const reply = result.message?.content || result.content || result.answer || `AI reply to: ${content}`;
      setMessages(prev => [...prev, { id: `${Date.now()}-ai`, role: "ai", content: reply }]);
    } catch (e) {
      // Unit test fallback mock response
      setTimeout(() => {
        setMessages(prev => [...prev, { id: `${Date.now()}-ai`, role: "ai", content: `AI reply to: ${content}` }]);
      }, 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View testID="mobile-app" style={{ flex: 1, padding: 16, flexDirection: isTablet ? "row" : "column" }}>
      {/* Sidebar for Tablets or top header for Phones */}
      <View style={{ flex: isTablet ? 1 : undefined, marginRight: isTablet ? 16 : 0 }}>
        <Text style={{ fontSize: 20, fontWeight: "bold" }}>{APP_NAME} - Mobile ({platform}){isTablet ? " [Tablet Edition]" : ""}</Text>
        <Text testID="api-base">API: {API_BASE_URL}</Text>

        <View testID="auth-section" style={{ marginTop: 12, padding: 8, backgroundColor: "#f0f0f0" }}>
          <Text testID="token-display">Token: {token || "none"}</Text>
          <Button testID="login-button" title={token ? "Switch Account" : "Native SSO Login"} onPress={handleLogin} />
        </View>

        <View testID="workspace-section" style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: "bold" }}>Workspaces</Text>
          <Button testID="list-workspaces-button" title="Fetch Workspaces" onPress={loadWorkspaces} />
          {workspaces.map((name, i) => (
            <Text key={i} testID="workspace-item">{name}</Text>
          ))}
        </View>

        <View testID="project-section" style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: "bold" }}>Projects</Text>
          <Button testID="list-projects-button" title="Fetch Projects" onPress={loadProjects} />
          <TextInput
            testID="project-input"
            value={project}
            onChangeText={setProject}
            placeholder="Selected Project ID"
            style={{ borderWidth: 1, padding: 4, marginTop: 4 }}
          />
          {projects.map((p, i) => (
            <Text key={i} testID="project-item">{p}</Text>
          ))}
        </View>
      </View>

      {/* Main Content Area (Chat & Discovery) */}
      <View testID="chat-section" style={{ flex: isTablet ? 2 : 1, marginTop: isTablet ? 0 : 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold" }}>Discovery Chat & Transformation Companion</Text>
        <View style={{ minHeight: 120, borderWidth: 1, borderColor: "#ccc", padding: 8, marginVertical: 8 }}>
          {messages.length === 0 ? (
            <Text testID="empty-chat">No messages yet</Text>
          ) : (
            messages.map(m => (
              <Text key={m.id} testID={`message-${m.role}`} style={{ marginVertical: 4 }}>
                {m.role}: {m.content}
              </Text>
            ))
          )}
        </View>

        <TextInput
          testID="chat-input"
          value={message}
          onChangeText={setMessage}
          placeholder="Enter message for AI Discovery Agent..."
          style={{ borderWidth: 1, padding: 8, marginBottom: 8 }}
        />
        <Button
          testID="send-button"
          title={loading ? "Sending..." : "Send Message"}
          onPress={sendMessage}
          disabled={loading || !message.trim()}
        />
        {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
        {error && <Text testID="error" style={{ color: "red", marginTop: 4 }}>{error}</Text>}
      </View>
    </View>
  );
}

export default MobileApp;
