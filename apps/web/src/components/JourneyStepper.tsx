import * as React from "react";

const STAGES = ["idea","discovery","business_analysis","solution_design","architecture","process_design","ux_design","data_design","planning","review","approved","implementation"] as const;

export function JourneyStepper({ projectId, token }: { projectId: string; token: string }): React.ReactElement {
  const [stages, setStages] = React.useState<Array<{ stage: string; status: string; stage_version: number }>>([]);
  const [current, setCurrent] = React.useState<string>("idea");
  const [version, setVersion] = React.useState<number | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/journey`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const list = data.stages || data.data || [];
      setStages(list);
      if (list.length) {
        const last = list[list.length - 1];
        setCurrent(last.stage || last.toStage || "idea");
        setVersion(last.stage_version || last.revision || last.version);
      }
    } catch (e) { setError(String((e as Error).message)); }
  }, [projectId, token]);

  React.useEffect(() => { void load(); }, [load]);

  const advance = async () => {
    const idx = STAGES.indexOf(current as typeof STAGES[number]);
    if (idx < 0 || idx >= STAGES.length - 1) return;
    const next = STAGES[idx + 1] as string;
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/journey/transition`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stage: next, status: "in_progress", version }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) { setError(String((e as Error).message)); }
  };

  return (
    <div data-testid="journey-stepper" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
      {STAGES.map((s) => {
        const isCurrent = s === current;
        const isPast = STAGES.indexOf(s as typeof STAGES[number]) < STAGES.indexOf(current as typeof STAGES[number]);
        return (
          <span key={s} data-testid={`stage-${s}`} style={{
            padding: "4px 8px", borderRadius: 6, fontSize: 12,
            background: isCurrent ? "#0f172a" : isPast ? "#d1fae5" : "#e5e7eb",
            color: isCurrent ? "#fff" : "#111",
            border: "1px solid #cbd5e1",
          }}>
            {s}{isCurrent ? " • current" : isPast ? " ✓" : ""}
          </span>
        );
      })}
      <button type="button" data-testid="advance-stage" onClick={advance} style={{ marginLeft: 8, padding: "4px 10px" }}>
        Advance
      </button>
      {error ? <span data-testid="journey-error" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      <span data-testid="journey-version" style={{ fontSize: 11, color: "#64748b" }}>v{version ?? 1}</span>
    </div>
  );
}
