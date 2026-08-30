/**
 * DiscoverySummary — TASK-013
 * Renders discovery summary artifact (structured) per 02 §4 output contract
 */

import * as React from "react";

export interface DiscoverySummaryData {
  type: "summary";
  summary: string;
  structured: {
    businessGoals: string[];
    challenges: string[];
    processes: string[];
    stakeholders: string[];
    recommendations: string[];
    maturity: { current: string; future: string };
  };
}

export interface DiscoverySummaryProps {
  data: DiscoverySummaryData | null;
}

export function DiscoverySummary({ data }: DiscoverySummaryProps): React.ReactElement | null {
  if (!data) return null;
  if (data.type !== "summary") return <p data-testid="discovery-question">{(data as unknown as { question: string }).question}</p>;
  const s = data.structured;
  return (
    <div data-testid="discovery-summary">
      <h3>Discovery Summary</h3>
      <p data-testid="summary-text">{data.summary}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section>
          <h4>Business Goals</h4>
          <ul>{s.businessGoals.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </section>
        <section>
          <h4>Challenges</h4>
          <ul>{s.challenges.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </section>
        <section>
          <h4>Processes</h4>
          <ul>{s.processes.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
        <section>
          <h4>Stakeholders</h4>
          <ul>{s.stakeholders.map((st, i) => <li key={i}>{st}</li>)}</ul>
        </section>
      </div>
      <h4>Recommendations</h4>
      <ul>{s.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <p data-testid="maturity">
        Current: {s.maturity.current} → Future: {s.maturity.future}
      </p>
    </div>
  );
}

export default DiscoverySummary;
