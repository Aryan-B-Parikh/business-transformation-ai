import * as React from "react";

type Node = { id: string; label: string; type?: string };
type Edge = { from: string; to: string; label?: string };

export function DiagramEditor({ spec, onChange }: { spec: { nodes: Node[]; edges: Edge[] }; onChange: (next: { nodes: Node[]; edges: Edge[] }) => void }): React.ReactElement {
  const [nodes, setNodes] = React.useState<Node[]>(spec.nodes);
  const [edges, setEdges] = React.useState<Edge[]>(spec.edges);

  React.useEffect(() => { setNodes(spec.nodes); setEdges(spec.edges); }, [spec]);

  const addNode = () => {
    const id = `n${Date.now()}`;
    const nextNodes = [...nodes, { id, label: `New Node ${nodes.length + 1}`, type: "service" }];
    setNodes(nextNodes);
    onChange({ nodes: nextNodes, edges });
  };

  const updateLabel = (id: string, label: string) => {
    const next = nodes.map(n => n.id === id ? { ...n, label } : n);
    setNodes(next);
    onChange({ nodes: next, edges });
  };

  return (
    <div data-testid="diagram-editor" style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Diagram Editor (editable — PRD §6)</strong>
        <button type="button" data-testid="add-node" onClick={addNode} style={{ fontSize: 12, padding: "4px 8px" }}>+ Node</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {nodes.map(n => (
          <div key={n.id} data-testid={`node-${n.id}`} style={{ border: "1px solid #cbd5e1", borderRadius: 4, padding: 6, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>{n.id} ({n.type || "service"})</div>
            <input data-testid={`node-label-${n.id}`} value={n.label} onChange={e => updateLabel(n.id, e.target.value)} style={{ width: "100%", marginTop: 4, fontSize: 12, padding: 4, border: "1px solid #e5e7eb", borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }} data-testid="edge-list">
        Edges: {edges.map(e => `${e.from}→${e.to}${e.label ? ` (${e.label})` : ""}`).join(", ") || "none"}
      </div>
      <p style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>Edits are local until saved via Artifact Editor; regenerates produce new version.</p>
    </div>
  );
}
