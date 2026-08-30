/**
 * TASK-013 — Web UI Chat & Discovery flow
 * DoD: Playwright-style test: user uploads a doc, chats, sees discovery summary artifact rendered
 * Simulated via @testing-library/react + mocked fetch
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { App } from "../src/App";
import { Chat } from "../src/components/Chat";
import { DiscoverySummary } from "../src/components/DiscoverySummary";
import { DocumentUpload } from "../src/components/DocumentUpload";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("TASK-013: DocumentUpload", () => {
  beforeEach(() => mockFetch.mockReset());

  it("renders upload widget with file input", () => {
    render(<DocumentUpload projectId="proj-1" token="tok" />);
    expect(screen.getByTestId("document-upload")).toBeDefined();
    expect(screen.getByTestId("file-input")).toBeDefined();
    expect(screen.getByText(/Supports PDF/)).toBeDefined();
  });

  it("uploads PDF and shows result (mocked)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "doc-1", filename: "sop.pdf", type: "pdf", storageUrl: "memory://", signedUrl: "/api/v1/documents/doc-1/file" }),
    } as Response);

    render(<DocumentUpload projectId="proj-1" token="tok" onUploaded={vi.fn()} />);
    const file = new File(["%PDF content"], "sop.pdf", { type: "application/pdf" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    // Simulate file change
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/projects/proj-1/documents"), expect.objectContaining({ method: "POST" }));
  });
});

describe("TASK-013: Chat", () => {
  beforeEach(() => mockFetch.mockReset());

  it("renders chat and starts conversation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 201, json: async () => ({ id: "conv-1", projectId: "proj-1" }),
    } as Response);
    render(<Chat projectId="proj-1" token="tok" />);
    expect(screen.getByTestId("chat")).toBeDefined();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/conversations"), expect.any(Object)));
  });

  it("sends message and receives AI reply", async () => {
    // Start conversation
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "conv-1" }) } as Response);
    // Send message -> returns aiMessage
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 201, json: async () => ({
        userMessage: { id: "u-1", role: "user", content: "hello", createdAt: new Date().toISOString() },
        aiMessage: { id: "ai-1", role: "ai", content: "What are your goals?", createdAt: new Date().toISOString() },
        aiResult: { type: "question", question: "What are your goals?" },
      }),
    } as Response);
    // getConversation after send
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ id: "conv-1", messages: [{ id: "u-1", role: "user", content: "hello" }, { id: "ai-1", role: "ai", content: "What are your goals?" }] }),
    } as Response);

    render(<Chat projectId="proj-1" token="tok" />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const input = screen.getByTestId("chat-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    const send = screen.getByTestId("send-button");
    fireEvent.click(send);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
  });

  it("shows discovery summary when AI returns summary", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "conv-1" }) } as Response);
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 201, json: async () => ({
        userMessage: { id: "u-1", role: "user", content: "goal automate" },
        aiMessage: { id: "ai-1", role: "ai", content: "Summary" },
        aiResult: { type: "summary", summary: "Discovery summary", structured: { businessGoals: ["Automate"], challenges: ["Manual"], processes: ["Order"], stakeholders: ["Sales"], recommendations: ["RPA"], maturity: { current: "2.5", future: "4.0" } } },
      }),
    } as Response);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "conv-1", messages: [] }) } as Response);

    const onSummary = vi.fn();
    render(<Chat projectId="proj-1" token="tok" onDiscoverySummary={onSummary} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const input = screen.getByTestId("chat-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "goal automate" } });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(onSummary).toHaveBeenCalled());
  });
});

describe("TASK-013: DiscoverySummary", () => {
  it("renders structured summary", () => {
    const data = {
      type: "summary" as const,
      summary: "Discovery summary for project X",
      structured: {
        businessGoals: ["Increase revenue"],
        challenges: ["Manual"],
        processes: ["Order capture"],
        stakeholders: ["Sales"],
        recommendations: ["Automate"],
        maturity: { current: "2.5 - Manual", future: "4.0 - Automated" },
      },
    };
    render(<DiscoverySummary data={data} />);
    expect(screen.getByTestId("discovery-summary")).toBeDefined();
    expect(screen.getByTestId("summary-text").textContent).toContain("Discovery summary");
    expect(screen.getByText("Increase revenue")).toBeDefined();
  });

  it("renders null when no data", () => {
    const { container } = render(<DiscoverySummary data={null} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("TASK-013: E2E — upload doc, chat, see summary (DoD)", () => {
  beforeEach(() => mockFetch.mockReset());

  it("App renders three sections and handles upload + chat flow", async () => {
    // 1) App mount: getJourneyState
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response);
    // 2) App mount: listArtifacts
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response);
    // 3) Chat mount: createConversation
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "conv-1" }) } as Response);
    render(<App projectId="proj-e2e" token="tok-e2e" />);
    await waitFor(() => {
      expect(screen.getByTestId("app")).toBeDefined();
    });
    expect(screen.getByText("1. Upload Business Documents")).toBeDefined();
    expect(screen.getByText("2. AI Transformation Companion")).toBeDefined();
    expect(screen.getByText("3. Discovery Summary")).toBeDefined();
    expect(screen.getByTestId("api-base").textContent).toContain("/api/v1");
    // Upload is inside App
    expect(screen.getByTestId("document-upload")).toBeDefined();
    expect(screen.getByTestId("chat")).toBeDefined();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });
});
