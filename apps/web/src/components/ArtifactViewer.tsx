/**
 * ArtifactViewer — TASK-019
 * Generic artifact viewer that renders any artifact type (text sections + diagram),
 * supports manual edit + "Regenerate" button per PRD §6 (editable, regenerable, versioned)
 */

import * as React from "react";

export interface Artifact {
  id: string;
  type: string;
  title: string;
  status: string;
  content: Record<string, unknown>;
  diagramUrl?: string | null;
  version: number;
  parentArtifactId?: string | null;
}

export interface ArtifactViewerProps {
  artifact: Artifact | null;
  onEdit?: (updates: Partial<Artifact>) => void;
  onRegenerate?: (feedback?: string) => void;
}

export function ArtifactViewer({ artifact, onEdit, onRegenerate }: ArtifactViewerProps): React.ReactElement | null {
  const [feedback, setFeedback] = React.useState("");
  if (!artifact) return <p data-testid="no-artifact">No artifact selected</p>;

  const content = artifact.content as { diagramSpec?: { nodes: { id: string; label: string }[]; edges: { from: string; to: string }[] }; [k: string]: unknown };
  const hasDiagram = Boolean(content.diagramSpec);

  return (
    <div data-testid="artifact-viewer">
      <header>
        <h3 data-testid="artifact-title">{artifact.title}</h3>
        <p data-testid="artifact-meta">
          Type: {artifact.type} | Status: {artifact.status} | Version: {artifact.version}
        </p>
      </header>

      <section data-testid="artifact-content">
        <h4>Content</h4>
        <pre style={{ background: "#f5f5f5", padding: 8, overflow: "auto" }}>{JSON.stringify(artifact.content, null, 2)}</pre>
      </section>

      {hasDiagram && (
        <section data-testid="artifact-diagram">
          <h4>Diagram</h4>
          <p>Nodes: {(content.diagramSpec!.nodes || []).length}, Edges: {(content.diagramSpec!.edges || []).length}</p>
          {/* In real app, SVG would be rendered via /artifacts/:id/render */}
          <div data-testid="diagram-placeholder" style={{ border: "1px dashed #999", padding: 16, textAlign: "center" }}>
            [Diagram: {(content.diagramSpec!.nodes || []).map((n) => n.label).join(" → ")}]
          </div>
        </section>
      )}

      <section style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          data-testid="edit-button"
          onClick={() => onEdit?.({ title: `${artifact.title} (edited)` })}
        >
          Edit Title
        </button>
        <input
          data-testid="feedback-input"
          placeholder="Feedback for regeneration"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          style={{ flex: 1 }}
        />
        <button data-testid="regenerate-button" onClick={() => onRegenerate?.(feedback)}>
          Regenerate
        </button>
      </section>

      <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>Advisory-only: status draft → in_review → approved requires human approval (PRD §6).</p>
    </div>
  );
}

export default ArtifactViewer;
