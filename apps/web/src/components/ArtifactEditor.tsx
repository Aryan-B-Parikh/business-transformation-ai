/**
 * ArtifactEditor — TASK-019 (companion to ArtifactViewer)
 * Allows editing a text field and saving, version increments
 */

import * as React from "react";
import { Artifact } from "./ArtifactViewer";

export interface ArtifactEditorProps {
  artifact: Artifact;
  onSave?: (updated: Artifact) => void;
}

export function ArtifactEditor({ artifact, onSave }: ArtifactEditorProps): React.ReactElement {
  const [title, setTitle] = React.useState(artifact.title);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setTitle(artifact.title);
  }, [artifact.title]);

  const handleSave = async () => {
    setSaving(true);
    // Simulate save: create new version with incremented version
    const updated: Artifact = { ...artifact, title, version: artifact.version + 1 };
    // In real app, PATCH /artifacts/:id would be called
    onSave?.(updated);
    setSaving(false);
  };

  return (
    <div data-testid="artifact-editor">
      <h4>Edit Artifact</h4>
      <label>
        Title:
        <input data-testid="edit-title-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
      </label>
      <button data-testid="save-button" onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Saving..." : "Save (new version)"}
      </button>
      <p data-testid="version-indicator">Version: {artifact.version} → {artifact.version + 1} on save</p>
    </div>
  );
}

export default ArtifactEditor;
