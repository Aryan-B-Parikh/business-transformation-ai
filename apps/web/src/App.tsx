/**
 * App — TASK-013 + TASK-019 (placeholder)
 * Composes Chat, DocumentUpload, DiscoverySummary per PRD FR-1.1, FR-2.1
 */

import { API_BASE, SupportedLanguage, t } from "@bta/shared";
import * as React from "react";
import { ArtifactViewer } from "./components/ArtifactViewer";
import { Chat } from "./components/Chat";
import { Dashboard } from "./components/Dashboard";
import { DiscoverySummary, DiscoverySummaryData } from "./components/DiscoverySummary";
import { DocumentUpload } from "./components/DocumentUpload";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

export const APP_NAME = "Business Transformation AI";
export const API_BASE_URL = API_BASE;

export interface AppProps {
  projectId?: string;
  token?: string;
}

export function App({ projectId = "demo-project", token = "demo-token" }: AppProps): React.ReactElement {
  const [lang, setLang] = React.useState<SupportedLanguage>("en");
  const [summary, setSummary] = React.useState<DiscoverySummaryData | null>(null);
  const [uploadedDoc, setUploadedDoc] = React.useState<unknown>(null);
  const [artifact, setArtifact] = React.useState<{ id: string; type: string; title: string; status: string; content: Record<string, unknown>; version: number } | null>({
    id: "demo-art-1",
    type: "architecture_hld",
    title: "Demo Architecture HLD",
    status: "draft",
    version: 1,
    content: { components: ["API Gateway", "Core API"], diagramSpec: { nodes: [{ id: "n0", label: "API Gateway" }, { id: "n1", label: "Core API" }], edges: [{ from: "n0", to: "n1" }] } },
  });
  const [dashboardScores] = React.useState({ digitalMaturity: 3.5, aiReadiness: 3.2, automationOpportunity: 3.8, projectHealth: 4.0, implementationReadiness: 3.5, solutionQuality: 4.0 });

  return (
    <div data-testid="app" style={{ fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <header>
        <h1>{t("app.title", lang)}</h1>
        <p data-testid="api-base">API: {API_BASE_URL}</p>
        <LanguageSwitcher value={lang} onChange={setLang} />
        <p data-testid="current-lang">Current: {lang}</p>
      </header>

      <section style={{ marginBottom: 24 }}>
        <h2>1. {t("upload.title", lang)}</h2>
        <DocumentUpload projectId={projectId} token={token} onUploaded={setUploadedDoc} />
        {uploadedDoc ? <p data-testid="uploaded-indicator">Document uploaded ✓</p> : null}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>2. {t("chat.title", lang)}</h2>
        <Chat projectId={projectId} token={token} onDiscoverySummary={setSummary as (s: unknown) => void} />
      </section>

      <section>
        <h2>3. {t("discovery.summary", lang)}</h2>
        {summary ? <DiscoverySummary data={summary} /> : <p data-testid="no-summary">Chat to generate discovery summary. The AI will ask clarifying questions until sufficient context is gathered, then produce a structured summary (TASK-010).</p>}
      </section>

      <section>
        <h2>4. Artifact Viewer / Editor (TASK-019)</h2>
        <ArtifactViewer
          artifact={artifact}
          onEdit={(updates) => setArtifact((prev) => (prev ? { ...prev, ...updates, version: prev.version + 1 } : null))}
          onRegenerate={(fb) => setArtifact((prev) => (prev ? { ...prev, version: prev.version + 1, content: { ...prev.content, feedback: fb } } : null))}
        />
        {artifact ? <p data-testid="artifact-version">Version: {artifact.version}</p> : null}
      </section>

      <section>
        <h2>5. Transformation Dashboard (TASK-022)</h2>
        <Dashboard scores={dashboardScores} counts={{ artifacts: 3, roadmapItems: 5, estimates: 3 }} />
      </section>

      <footer style={{ marginTop: 24, fontSize: 12, color: "#666" }}>
        <p>Advisory-only AI output — requires human review before implementation (PRD §6).</p>
        <p>Artifacts editable, regenerable, version-controlled per PRD §6.</p>
      </footer>
    </div>
  );
}

export default App;
