import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MobileApp, SecureStore } from "../src/App";

function render(element: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}
function cleanup(root: Root, container: HTMLDivElement): void { act(() => root.unmount()); container.remove(); }
function hasText(container: HTMLElement, value: string | RegExp): boolean { const content = container.textContent ?? ""; return typeof value === "string" ? content.includes(value) : value.test(content); }
async function flush(): Promise<void> { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe("TASK-029: Genuine Mobile App Shell & API Parity", () => {
  beforeEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders iOS, Android and tablet layouts", () => {
    const { container, root } = render(<MobileApp platform="ios" isTablet={false} />);
    expect(container.querySelector('[data-testid="mobile-app"]')).not.toBeNull();
    expect(hasText(container, /Mobile \(ios\)/)).toBe(true);
    expect(container.querySelector('[data-testid="auth-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-section"]')).not.toBeNull();
    act(() => root.render(<MobileApp platform="android" isTablet={false} />));
    expect(hasText(container, /Mobile \(android\)/)).toBe(true);
    act(() => root.render(<MobileApp platform="ios" isTablet={true} />));
    expect(hasText(container, /\[Tablet\]/)).toBe(true);
    cleanup(root, container);
  });

  it("authenticates via real API login and persists token in SecureStore", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true, json: async () => ({ token: "jwt-real-session-token", user: { id: "u-1", name: "Admin" } }) } as any).mockResolvedValueOnce({ ok: true, json: async () => [{ id: "ws-1", name: "Enterprise Workspace" }] } as any).mockResolvedValueOnce({ ok: true, json: async () => [{ id: "p-1", name: "Core Modernization", workspaceId: "ws-1" }] } as any);
    const { container, root } = render(<MobileApp platform="ios" />);
    expect(hasText(container, "Status: Signed Out")).toBe(true);
    const login = container.querySelector('[data-testid="login-button"]') as HTMLButtonElement;
    await act(async () => { login.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(hasText(container, "Status: Authenticated")).toBe(true);
    expect(await SecureStore.getItemAsync("auth_token")).toBe("jwt-real-session-token");
    cleanup(root, container);
  });

  it("fetches live workspaces and projects for authenticated user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true, json: async () => [{ id: "ws-1", name: "Cloud Transformation Workspace" }] } as any).mockResolvedValueOnce({ ok: true, json: async () => [{ id: "proj-101", name: "Legacy Migration", workspaceId: "ws-1" }] } as any);
    const { container, root } = render(<MobileApp token="valid-token" />);
    const button = container.querySelector('[data-testid="list-workspaces-button"]') as HTMLButtonElement;
    await act(async () => { button.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(hasText(container, /Cloud Transformation Workspace/)).toBe(true);
    cleanup(root, container);
  });

  it("sends discovery messages through the live API contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true, json: async () => ({ id: "conv-1", title: "Mobile Discovery" }) } as any).mockResolvedValueOnce({ ok: true, json: async () => ({ id: "msg-1", role: "ai", content: "Architecture analysis complete.", citations: [{ documentId: "doc-1", chunkText: "Legacy Oracle 11g" }] }) } as any);
    const { container, root } = render(<MobileApp token="valid-token" projectId="proj-101" />);
    const input = container.querySelector('[data-testid="chat-input"]') as HTMLInputElement;
    const send = container.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Analyze current database");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      send.click();
      await Promise.resolve(); await Promise.resolve();
    });
    await flush();
    expect(hasText(container, "Analyze current database")).toBe(true);
    expect(hasText(container, "Architecture analysis complete.")).toBe(true);
    expect(hasText(container, /Citations: doc-1/)).toBe(true);
    cleanup(root, container);
  });

  it("uses unified Core API base configuration", async () => {
    const { API_BASE } = await import("@bta/shared");
    const { container, root } = render(<MobileApp />);
    expect(hasText(container, `API: ${API_BASE}`)).toBe(true);
    cleanup(root, container);
  });
});
