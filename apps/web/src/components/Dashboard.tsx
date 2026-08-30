/**
 * Dashboard — TASK-022
 * Web dashboard UI with charts for maturity/readiness/health scores per 04_API_SPEC.md § Dashboard
 */

import * as React from "react";

export interface DashboardScores {
  digitalMaturity: number;
  aiReadiness: number;
  automationOpportunity: number;
  projectHealth: number;
  implementationReadiness: number;
  solutionQuality: number;
}

export interface DashboardProps {
  scores: DashboardScores | null;
  counts?: { artifacts: number; roadmapItems: number; estimates: number };
}

function Bar({ label, value }: { label: string; value: number }): React.ReactElement {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  return (
    <div data-testid={`bar-${label}`} style={{ margin: "4px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span>{value.toFixed(1)} / 5</span>
      </div>
      <div style={{ background: "#eee", height: 12, borderRadius: 4 }}>
        <div style={{ width: `${pct}%`, background: value >= 4 ? "#28a745" : value >= 3 ? "#ffc107" : "#dc3545", height: 12, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function Dashboard({ scores, counts }: DashboardProps): React.ReactElement | null {
  if (!scores) return <p data-testid="no-dashboard">No dashboard data. Generate artifacts to see scores.</p>;
  return (
    <div data-testid="dashboard">
      <h3>Transformation Dashboard</h3>
      <Bar label="Digital Maturity" value={scores.digitalMaturity} />
      <Bar label="AI Readiness" value={scores.aiReadiness} />
      <Bar label="Automation Opportunity" value={scores.automationOpportunity} />
      <Bar label="Project Health" value={scores.projectHealth} />
      <Bar label="Implementation Readiness" value={scores.implementationReadiness} />
      <Bar label="Solution Quality" value={scores.solutionQuality} />
      {counts ? <p data-testid="dashboard-counts">Artifacts: {counts.artifacts} | Roadmap Items: {counts.roadmapItems} | Estimates: {counts.estimates}</p> : null}
    </div>
  );
}

export default Dashboard;
