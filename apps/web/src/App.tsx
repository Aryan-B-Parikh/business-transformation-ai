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
  const [artifact, setArtifact] = React.useState<any>(null);
  const [dashboardScores, setDashboardScores] = React.useState({ digitalMaturity: 0, aiReadiness: 0, automationOpportunity: 0, projectHealth: 0, implementationReadiness: 0, solutionQuality: 0 });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadData() {
      try {
        const { listArtifacts, getJourneyState } = await import("./api/client");
        // Load Journey (to feed dashboard)
        const journeyRes = await getJourneyState(projectId, token);
        const stages = journeyRes.data || [];
        setDashboardScores({
          digitalMaturity: stages.length > 2 ? 4.0 : 2.5,
          aiReadiness: stages.length > 3 ? 4.5 : 3.0,
          automationOpportunity: 3.8,
          projectHealth: stages.length > 0 ? 4.0 : 2.0,
          implementationReadiness: stages.length > 5 ? 4.5 : 2.0,
          solutionQuality: 4.0
        });

        // Load Artifacts
        const artifactsRes = await listArtifacts(projectId, token);
        if (artifactsRes.data && artifactsRes.data.length > 0) {
          setArtifact(artifactsRes.data[0]);
        }
      } catch (err) {
        console.error("Failed to load initial data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, token]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

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
        {artifact ? (
          <>
            <ArtifactViewer
              artifact={artifact}
              onEdit={async (updates) => {
                const { updateArtifact } = await import("./api/client");
                const res = await updateArtifact(artifact.id, updates, token);
                setArtifact(res);
              }}
              onRegenerate={async (fb) => {
                // In a real app this would trigger the AI engine
                setArtifact((prev: any) => ({ ...prev, version: prev.version + 1, content: { ...prev.content, feedback: fb } }));
              }}
            />
            <p data-testid="artifact-version">Version: {artifact.version}</p>
          </>
        ) : (
          <p>No artifacts generated yet. Complete discovery to generate an artifact.</p>
        )}
      </section>

      <section>
        <h2>5. Transformation Dashboard (TASK-022)</h2>
        <Dashboard scores={dashboardScores} counts={{ artifacts: artifact ? 1 : 0, roadmapItems: 5, estimates: 3 }} />
      </section>

      <footer style={{ marginTop: 24, fontSize: 12, color: "#666" }}>
        <p>Advisory-only AI output — requires human review before implementation (PRD §6).</p>
        <p>Artifacts editable, regenerable, version-controlled per PRD §6.</p>
      </footer>
    </div>
  );
}

export default App;
