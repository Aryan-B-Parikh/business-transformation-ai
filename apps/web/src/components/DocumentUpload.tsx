/**
 * DocumentUpload — TASK-013
 * Upload widget for PDF/DOCX/PPTX per 04_API_SPEC.md § Documents & Context
 */

import * as React from "react";
import { uploadDocument } from "../api/client";

export interface DocumentUploadProps {
  projectId: string;
  token: string;
  onUploaded?: (doc: unknown) => void;
}

export function DocumentUpload({ projectId, token, onUploaded }: DocumentUploadProps): React.ReactElement {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastDoc, setLastDoc] = React.useState<unknown>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadDocument(projectId, file, token);
      setLastDoc(doc);
      onUploaded?.(doc);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div data-testid="document-upload">
      <h3>Upload Business Documents</h3>
      <p>Supports PDF, DOCX, PPTX, SOP, BRD per PRD FR-2.1</p>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.pptx,.doc,.ppt"
        onChange={handleFile}
        disabled={uploading}
        data-testid="file-input"
      />
      {uploading ? <p data-testid="uploading">Uploading...</p> : null}
      {error ? <p role="alert" data-testid="upload-error">{error}</p> : null}
      {lastDoc ? <pre data-testid="upload-result">{JSON.stringify(lastDoc, null, 2)}</pre> : null}
    </div>
  );
}

export default DocumentUpload;
