/**
 * TASK-019 — Artifact viewer/editor
 * DoD: User can view an architecture artifact, edit a text field, save, and see version increment
 */

import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { ArtifactEditor } from "../src/components/ArtifactEditor";
import { ArtifactViewer } from "../src/components/ArtifactViewer";

describe("ArtifactViewer", () => {
  const artifact = {
    id: "art-1",
    type: "architecture_hld",
    title: "Architecture HLD",
    status: "draft",
    content: { components: ["API Gateway"], diagramSpec: { nodes: [{ id: "n0", label: "API Gateway" }], edges: [] } },
    version: 1,
  };

  it("renders artifact title, type, version, content, diagram", () => {
    render(<ArtifactViewer artifact={artifact} />);
    expect(screen.getByTestId("artifact-viewer")).toBeDefined();
    expect(screen.getByTestId("artifact-title").textContent).toBe("Architecture HLD");
    expect(screen.getByTestId("artifact-meta").textContent).toContain("architecture_hld");
    expect(screen.getByTestId("artifact-meta").textContent).toContain("Version: 1");
    expect(screen.getByTestId("artifact-content").textContent).toContain("API Gateway");
    expect(screen.getByTestId("artifact-diagram")).toBeDefined();
    expect(screen.getByTestId("diagram-placeholder").textContent).toContain("API Gateway");
  });

  it("calls onEdit when Edit Title clicked", () => {
    const onEdit = vi.fn();
    render(<ArtifactViewer artifact={artifact} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("edit-button"));
    expect(onEdit).toHaveBeenCalledWith({ title: "Architecture HLD (edited)" });
  });

  it("calls onRegenerate with feedback", () => {
    const onReg = vi.fn();
    render(<ArtifactViewer artifact={artifact} onRegenerate={onReg} />);
    const input = screen.getByTestId("feedback-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Use Azure" } });
    fireEvent.click(screen.getByTestId("regenerate-button"));
    expect(onReg).toHaveBeenCalledWith("Use Azure");
  });

  it("shows no-artifact when null", () => {
    render(<ArtifactViewer artifact={null} />);
    expect(screen.getByTestId("no-artifact")).toBeDefined();
  });
});

describe("ArtifactEditor", () => {
  it("edits title and saves with version increment", () => {
    const art = { id: "art-1", type: "wireframe", title: "Wireframe", status: "draft", content: {}, version: 1 } as never;
    const onSave = vi.fn();
    render(<ArtifactEditor artifact={art} onSave={onSave} />);
    expect(screen.getByTestId("version-indicator").textContent).toContain("Version: 1 → 2");
    const input = screen.getByTestId("edit-title-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.click(screen.getByTestId("save-button"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "New Title", version: 2 }));
  });
});

describe("TASK-019 E2E: App artifact viewer integration", () => {
  it("App shows artifact viewer and version increment on edit/regenerate", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: "art-1", version: 1, content: {} }] }) } as Response);

    const { App } = await import("../src/App");
    const { render: r, waitFor } = await import("@testing-library/react");
    const view = r(<App />);
    await waitFor(() => {
      expect(view.getByTestId("artifact-viewer")).toBeDefined();
    });
    expect(view.getByTestId("artifact-version").textContent).toContain("Version: 1");
    // Click Edit Title
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "art-1", version: 2, content: {} }) } as Response);
    fireEvent.click(view.getByTestId("edit-button"));
    await waitFor(() => {
      expect(view.getByTestId("artifact-version").textContent).toContain("Version: 2");
    });
    // Regenerate — mock the regenerateArtifact fetch
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "art-1", version: 3, content: {} }) } as Response);
    const fb = view.getByTestId("feedback-input") as HTMLInputElement;
    fireEvent.change(fb, { target: { value: "feedback" } });
    fireEvent.click(view.getByTestId("regenerate-button"));
    await waitFor(() => {
      expect(view.getByTestId("artifact-version").textContent).toContain("Version: 3");
    });
  });
});
