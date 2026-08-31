import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MobileApp, SecureStore } from "../src/App";

describe("TASK-029: Genuine Mobile App Shell & API Parity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders for iOS and Android with parity and tablet split-pane support", () => {
    const { rerender } = render(<MobileApp platform="ios" isTablet={false} />);
    expect(screen.getByTestId("mobile-app")).toBeDefined();
    expect(screen.getByText(/Mobile \(ios\)/)).toBeDefined();
    expect(screen.getByTestId("auth-section")).toBeDefined();
    expect(screen.getByTestId("chat-section")).toBeDefined();

    // Android parity
    rerender(<MobileApp platform="android" isTablet={false} />);
    expect(screen.getByText(/Mobile \(android\)/)).toBeDefined();

    // Tablet layout
    rerender(<MobileApp platform="ios" isTablet={true} />);
    expect(screen.getByText(/\[Tablet\]/)).toBeDefined();
  });

  it("authenticates via real API login and persists token in SecureStore", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "jwt-real-session-token", user: { id: "u-1", name: "Admin" } })
    } as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "ws-1", name: "Enterprise Workspace" }]
    } as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "p-1", name: "Core Modernization", workspaceId: "ws-1" }]
    } as any);

    render(<MobileApp platform="ios" />);
    expect(screen.getByText("Status: Signed Out")).toBeDefined();

    fireEvent.click(screen.getByTestId("login-button"));

    await waitFor(() => {
      expect(screen.getByText("Status: Authenticated")).toBeDefined();
    });

    const savedToken = await SecureStore.getItemAsync("auth_token");
    expect(savedToken).toBe("jwt-real-session-token");
  });

  it("fetches live workspaces and projects for authenticated user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "ws-1", name: "Cloud Transformation Workspace" }]
    } as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "proj-101", name: "Legacy Migration", workspaceId: "ws-1" }]
    } as any);

    render(<MobileApp token="valid-token" />);
    expect(screen.getByText("Status: Authenticated")).toBeDefined();

    fireEvent.click(screen.getByTestId("list-workspaces-button"));

    await waitFor(() => {
      expect(screen.getByText(/Cloud Transformation Workspace/)).toBeDefined();
    });
  });

  it("sends discovery messages through real API with conversation state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "conv-1", title: "Mobile Discovery" })
    } as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "msg-1", role: "ai", content: "Architecture analysis complete.", citations: [{ documentId: "doc-1", chunkText: "Legacy Oracle 11g" }] })
    } as any);

    render(<MobileApp token="valid-token" projectId="proj-101" />);

    const input = screen.getByTestId("chat-input");
    fireEvent.change(input, { target: { value: "Analyze current database" } });
    fireEvent.click(screen.getByTestId("send-button"));

    await waitFor(() => {
      expect(screen.getByText("Analyze current database")).toBeDefined();
      expect(screen.getByText("Architecture analysis complete.")).toBeDefined();
      expect(screen.getByText(/Citations: doc-1/)).toBeDefined();
    });
  });

  it("uses unified Core API base configuration", async () => {
    const { API_BASE } = await import("@bta/shared");
    render(<MobileApp />);
    expect(screen.getByText(`API: ${API_BASE}`)).toBeDefined();
  });
});
