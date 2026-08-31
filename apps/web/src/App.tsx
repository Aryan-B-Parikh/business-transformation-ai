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
export interface AppProps { projectId?: string; token?: string; }

type DashboardState = { digitalMaturity: number; aiReadiness: number; automationOpportunity: number; projectHealth: number; implementationReadiness: number; solutionQuality: number };
const emptyScores: DashboardState = { digitalMaturity: 0, aiReadiness: 0, automationOpportunity: 0, projectHealth: 0, implementationReadiness: 0, solutionQuality: 0 };

export function App({ projectId = "default-proj", token = "test-token" }: AppProps): React.ReactElement {
  const [lang, setLang] = React.useState<SupportedLanguage>("en");
  const [summary, setSummary] = React.useState<DiscoverySummaryData | null>(null);
  const [uploadedDoc, setUploadedDoc] = React.useState<unknown>(null);
  const [artifact, setArtifact] = React.useState<any>(null);
  const [dashboardScores, setDashboardScores] = React.useState(emptyScores);
  const [counts, setCounts] = React.useState({ artifacts: 0, roadmapItems: 0, estimates: 0 });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!projectId || !token) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const api = await import("./api/client");
        const [dashboardRes, artifactsRes] = await Promise.all([
          api.getDashboard(projectId, token).catch(() => ({ scores: emptyScores, counts: { artifacts: 0, roadmapItems: 0, estimates: 0 } })),
          api.listArtifacts(projectId, token).catch(() => ({ data: [] }))
        ]);
        if (cancelled) return;
        setDashboardScores(dashboardRes?.scores || emptyScores);
        setCounts(dashboardRes?.counts || { artifacts: 0, roadmapItems: 0, estimates: 0 });
        if (artifactsRes?.data?.length) setArtifact(artifactsRes.data[0]);
      } catch (e) {
        if (!cancelled) setError(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, token]);

  if (loading) return <div data-testid="loading" style={{ padding: 24 }}>Loading project...</div>;

  return <div data-testid="app" style={{ fontFamily: "sans-serif", maxWidth: 1100, margin: "0 auto", padding: 16 }}>
    <header><h1>{t("app.title", lang)}</h1><p data-testid="api-base">API: {API_BASE_URL}</p><LanguageSwitcher value={lang} onChange={setLang} /><p data-testid="current-lang">Current: {lang}</p></header>
    <section><h2>1. {t("upload.title", lang)}</h2><DocumentUpload projectId={projectId} token={token} onUploaded={setUploadedDoc} />{uploadedDoc ? <p data-testid="uploaded-indicator">Document uploaded</p> : null}</section>
    <section><h2>2. {t("chat.title", lang)}</h2><Chat projectId={projectId} token={token} onDiscoverySummary={setSummary as (s: unknown) => void} /></section>
    <section><h2>3. {t("discovery.summary", lang)}</h2>{summary ? <DiscoverySummary data={summary} /> : <p data-testid="no-summary">No discovery summary yet.</p>}</section>
    <section><h2>4. Artifact Viewer / Editor</h2>{artifact ? <><ArtifactViewer artifact={artifact} onEdit={async updates => { setArtifact((prev: any) => ({ ...prev, ...updates, version: (prev?.version || 1) + 1 })); try { const { updateArtifact } = await import("./api/client"); const res = await updateArtifact(artifact.id, updates, token!); if (res) setArtifact(res); } catch (e) { console.error(e); } }} onRegenerate={async feedback => { setArtifact((prev: any) => ({ ...prev, version: (prev?.version || 1) + 1 })); try { const { regenerateArtifact } = await import("./api/client"); const res = await regenerateArtifact(artifact.id, feedback || "", token!, artifact.version); if (res) setArtifact(res); } catch (e) { console.error(e); } }} /><p data-testid="artifact-version">Version: {artifact.version}</p></> : <p data-testid="no-artifacts">No artifacts generated yet.</p>}</section>
    <section><h2>5. Transformation Dashboard (TASK-022)</h2><Dashboard scores={dashboardScores} counts={counts} /></section>
    <footer style={{ marginTop: 24, fontSize: 12 }}><p>Advisory-only AI output - requires human review before implementation.</p></footer>
  </div>;
}
export default App;
