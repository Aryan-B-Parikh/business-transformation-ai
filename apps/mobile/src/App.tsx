import * as React from "react";
import { View, Text, TextInput, Button, ActivityIndicator, Dimensions, ScrollView } from "react-native";
import { API_BASE, SupportedLanguage, t } from "@bta/shared";

let ExpoSecureStore: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoSecureStore = require("expo-secure-store");
} catch {
  // Non-native fallback
}

export const APP_NAME = "Business Transformation AI";
export const API_BASE_URL = API_BASE;

const RNView = View as any;
const RNText = Text as any;
const RNTextInput = TextInput as any;
const RNButton = Button as any;
const RNScrollView = ScrollView as any;
const RNActivityIndicator = ActivityIndicator as any;

export interface MobileAppProps {
  projectId?: string;
  token?: string;
  platform?: "ios" | "android" | "web";
  isTablet?: boolean;
}

export interface WorkspaceItem {
  id: string;
  name: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  workspaceId: string;
}

export interface MessageItem {
  id: string;
  role: "user" | "ai";
  content: string;
  citations?: Array<{ documentId: string; chunkText: string }>;
}

declare global {
  // eslint-disable-next-line no-var
  var __inMemoryStore: Map<string, string> | undefined;
}

// Genuine SecureStore wrapper with native fallback for unit tests
export const SecureStore = {
  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      if (ExpoSecureStore && typeof ExpoSecureStore.setItemAsync === "function") {
        await ExpoSecureStore.setItemAsync(key, value);
        return;
      }
    } catch {
      // Fallback in node environment
    }
    if (!globalThis.__inMemoryStore) {
      globalThis.__inMemoryStore = new Map();
    }
    globalThis.__inMemoryStore.set(key, value);
  },
  async getItemAsync(key: string): Promise<string | null> {
    try {
      if (ExpoSecureStore && typeof ExpoSecureStore.getItemAsync === "function") {
        const res = await ExpoSecureStore.getItemAsync(key);
        if (res !== null && res !== undefined) return res;
      }
    } catch {
      // Fallback in node environment
    }
    return globalThis.__inMemoryStore?.get(key) ?? null;
  },
  async deleteItemAsync(key: string): Promise<void> {
    try {
      if (ExpoSecureStore && typeof ExpoSecureStore.deleteItemAsync === "function") {
        await ExpoSecureStore.deleteItemAsync(key);
        return;
      }
    } catch {
      // Fallback in node environment
    }
    globalThis.__inMemoryStore?.delete(key);
  }
};

export function MobileApp({
  projectId: initialProjectId,
  token: initialToken,
  platform = "ios",
  isTablet: overrideTablet
}: MobileAppProps): React.ReactElement {
  const [token, setToken] = React.useState<string>(initialToken ?? "");
  const [email, setEmail] = React.useState("admin@example.com");
  const [password, setPassword] = React.useState("AdminPassword123!");
  const [lang, setLang] = React.useState<SupportedLanguage>("en");
  const [workspaces, setWorkspaces] = React.useState<WorkspaceItem[]>([]);
  const [projects, setProjects] = React.useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>(initialProjectId ?? "");
  const [activeConversationId, setActiveConversationId] = React.useState<string>("");
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const windowWidth = Dimensions.get("window")?.width || 800;
  const isTablet = overrideTablet ?? windowWidth >= 768;

  React.useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
      void SecureStore.setItemAsync("auth_token", initialToken);
    } else {
      void SecureStore.getItemAsync("auth_token").then(saved => {
        if (saved) setToken(saved);
      });
    }
  }, [initialToken]);

  const request = React.useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept-Language": lang,
        ...((init.headers as Record<string, string>) || {})
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed with status ${response.status}`);
      }
      return response.json();
    },
    [token, lang]
  );

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await request("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      const receivedToken = res.token || res.accessToken;
      if (!receivedToken) {
        throw new Error("No token returned from login");
      }
      setToken(receivedToken);
      await SecureStore.setItemAsync("auth_token", receivedToken);
      await loadWorkspaces(receivedToken);
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setToken("");
    setWorkspaces([]);
    setProjects([]);
    setMessages([]);
    await SecureStore.deleteItemAsync("auth_token");
  };

  const loadWorkspaces = async (overrideToken?: string) => {
    setLoading(true);
    setError(null);
    try {
      const authHeader: Record<string, string> = overrideToken ? { Authorization: `Bearer ${overrideToken}` } : {};
      const res = await request("/api/v1/workspaces", { headers: authHeader });
      const list: WorkspaceItem[] = res.data || res || [];
      setWorkspaces(list);
      if (list.length > 0) {
        await loadProjectsForWorkspace(list[0].id, overrideToken);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  const loadProjectsForWorkspace = async (workspaceId: string, overrideToken?: string) => {
    setLoading(true);
    setError(null);
    try {
      const authHeader: Record<string, string> = overrideToken ? { Authorization: `Bearer ${overrideToken}` } : {};
      const res = await request(`/api/v1/workspaces/${workspaceId}/projects`, { headers: authHeader });
      const list: ProjectItem[] = res.data || res || [];
      setProjects(list);
      if (list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !selectedProjectId) return;
    const content = message.trim();
    setMessage("");
    setError(null);

    const userMsg: MessageItem = { id: `user-${Date.now()}`, role: "user", content };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      let convId = activeConversationId;
      if (!convId) {
        const convRes = await request(`/api/v1/projects/${selectedProjectId}/conversations`, {
          method: "POST",
          body: JSON.stringify({ title: "Mobile Discovery" })
        });
        convId = convRes.id;
        setActiveConversationId(convId);
      }

      const msgRes = await request(`/api/v1/conversations/${convId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });

      const aiMsg: MessageItem = {
        id: msgRes.id || `ai-${Date.now()}`,
        role: "ai",
        content: msgRes.content || msgRes.reply || "Response received",
        citations: msgRes.citations
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      setError(e.message || "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <RNView testID="mobile-app" style={{ flex: 1, padding: 16, flexDirection: isTablet ? "row" : "column" }}>
      {/* Sidebar (Tablet) or Header (Phone) */}
      <RNView style={{ flex: isTablet ? 1 : undefined, marginRight: isTablet ? 16 : 0, maxWidth: isTablet ? 340 : undefined }}>
        <RNText testID="app-header" style={{ fontSize: 18, fontWeight: "bold" }}>
          {`${APP_NAME} - Mobile (${platform})${isTablet ? " [Tablet]" : ""}`}
        </RNText>
        <RNText testID="api-base" style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          API: {API_BASE_URL}
        </RNText>

        {/* Authentication Box */}
        <RNView testID="auth-section" style={{ padding: 10, backgroundColor: "#f4f4f5", borderRadius: 6, marginBottom: 12 }}>
          <RNText testID="token-display" style={{ fontSize: 12, color: "#444", marginBottom: 4 }}>
            Status: {token ? "Authenticated" : "Signed Out"}
          </RNText>
          {!token ? (
            <RNView>
              <RNTextInput
                testID="email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 6, marginBottom: 6 }}
              />
              <RNTextInput
                testID="password-input"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Password"
                style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 6, marginBottom: 6 }}
              />
              <RNButton testID="login-button" title="Sign In" onPress={handleLogin} disabled={loading} />
            </RNView>
          ) : (
            <RNButton testID="logout-button" title="Sign Out" onPress={handleLogout} color="#ef4444" />
          )}
        </RNView>

        {/* Workspaces & Projects */}
        {token && (
          <RNScrollView style={{ maxHeight: isTablet ? 400 : 200 }}>
            <RNView testID="workspace-section" style={{ marginBottom: 12 }}>
              <RNText style={{ fontWeight: "bold", marginBottom: 4 }}>Workspaces</RNText>
              <RNButton testID="list-workspaces-button" title="Refresh Workspaces" onPress={() => loadWorkspaces()} />
              {workspaces.map(w => (
                <RNText key={w.id} testID="workspace-item" style={{ paddingVertical: 4 }}>
                  • {w.name}
                </RNText>
              ))}
            </RNView>

            <RNView testID="project-section" style={{ marginBottom: 12 }}>
              <RNText style={{ fontWeight: "bold", marginBottom: 4 }}>Projects</RNText>
              <RNButton
                testID="list-projects-button"
                title="Refresh Projects"
                onPress={() => workspaces[0] && loadProjectsForWorkspace(workspaces[0].id)}
              />
              <RNTextInput
                testID="project-input"
                value={selectedProjectId}
                onChangeText={setSelectedProjectId}
                placeholder="Active Project ID"
                style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 6, marginTop: 6 }}
              />
              {projects.map(p => (
                <RNText key={p.id} testID="project-item" style={{ paddingVertical: 4 }}>
                  • {p.name} ({p.id})
                </RNText>
              ))}
            </RNView>
          </RNScrollView>
        )}
      </RNView>

      {/* Main Content Area (Chat & Discovery) */}
      <RNView testID="chat-section" style={{ flex: isTablet ? 2 : 1, marginTop: isTablet ? 0 : 12 }}>
        <RNText style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
          {t("chat.title", lang) || "AI Discovery & Transformation"}
        </RNText>

        <RNScrollView style={{ flex: 1, minHeight: 160, borderWidth: 1, borderColor: "#e4e4e7", borderRadius: 6, padding: 8, marginBottom: 8 }}>
          {messages.length === 0 ? (
            <RNText testID="empty-chat" style={{ color: "#71717a", textAlign: "center", marginTop: 20 }}>
              {token ? "No conversation messages yet. Ask a question to begin." : "Sign in to begin transformation discovery."}
            </RNText>
          ) : (
            messages.map(m => (
              <RNView key={m.id} testID={`message-${m.role}`} style={{ marginVertical: 4, padding: 6, backgroundColor: m.role === "user" ? "#e0f2fe" : "#f1f5f9", borderRadius: 6 }}>
                <RNText style={{ fontWeight: "bold", fontSize: 12, color: m.role === "user" ? "#0284c7" : "#475569" }}>
                  {m.role.toUpperCase()}:
                </RNText>
                <RNText style={{ fontSize: 14, marginTop: 2 }}>{m.content}</RNText>
                {m.citations && m.citations.length > 0 && (
                  <RNText style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    📚 Citations: {m.citations.map(c => c.documentId).join(", ")}
                  </RNText>
                )}
              </RNView>
            ))
          )}
        </RNScrollView>

        <RNTextInput
          testID="chat-input"
          value={message}
          onChangeText={setMessage}
          placeholder="Ask AI Transformation Assistant..."
          style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, marginBottom: 8 }}
        />

        <RNButton
          testID="send-button"
          title={loading ? "Sending..." : "Send Message"}
          onPress={sendMessage}
          disabled={loading || !token || !selectedProjectId || !message.trim()}
        />

        {loading && <RNActivityIndicator style={{ marginTop: 8 }} />}
        {error && (
          <RNText testID="error" style={{ color: "#dc2626", marginTop: 6, fontSize: 12 }}>
            {error}
          </RNText>
        )}
      </RNView>
    </RNView>
  );
}

export default MobileApp;
