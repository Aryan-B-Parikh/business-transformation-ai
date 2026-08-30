/**
 * Diagram render service — TASK-018
 * Render BPMN/ER/architecture/wireframe diagram_spec JSON to SVG/PNG (server-side)
 * DoD: Given each diagram type's fixture spec, produces valid image file; visually spot-checked
 *
 * v1: Generate simple SVG via string templating. Real would use BPMN.js/mermaid/custom SVG.
 * Valid SVG: <svg xmlns...> with nodes as rect+text and edges as line.
 */

export interface DiagramSpec {
  nodes: { id: string; label: string; type?: string }[];
  edges: { from: string; to: string; label?: string }[];
}

export interface RenderOptions {
  width?: number;
  height?: number;
  bg?: string;
}

export function renderToSvg(spec: DiagramSpec, opts: RenderOptions = {}): string {
  if (!spec || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
    throw new Error("Invalid diagramSpec: nodes/edges required");
  }
  if (spec.nodes.length === 0) throw new Error("diagramSpec.nodes must have at least 1 node");

  const width = opts.width || 800;
  const height = opts.height || Math.max(200, spec.nodes.length * 80 + 100);
  const bg = opts.bg || "#ffffff";

  // Layout: vertical list, 120px per node
  const nodePos = new Map<string, { x: number; y: number }>();
  spec.nodes.forEach((n, i) => {
    const x = 100 + (i % 3) * 220;
    const y = 60 + Math.floor(i / 3) * 120;
    nodePos.set(n.id, { x, y });
  });

  const nodesSvg = spec.nodes
    .map((n) => {
      const pos = nodePos.get(n.id)!;
      const color =
        n.type === "gateway" ? "#fff3cd" : n.type === "entity" ? "#d1ecf1" : n.type === "dashboard" ? "#d4edda" : "#e9ecef";
      return `
        <g data-node-id="${escapeXml(n.id)}">
          <rect x="${pos.x}" y="${pos.y}" width="180" height="50" rx="6" fill="${color}" stroke="#333" stroke-width="1.5"/>
          <text x="${pos.x + 90}" y="${pos.y + 30}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#000">${escapeXml(n.label)}</text>
        </g>`;
    })
    .join("\n");

  const edgesSvg = spec.edges
    .map((e) => {
      const from = nodePos.get(e.from);
      const to = nodePos.get(e.to);
      if (!from || !to) return "";
      const x1 = from.x + 90;
      const y1 = from.y + 50;
      const x2 = to.x + 90;
      const y2 = to.y;
      const label = e.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" font-size="10" fill="#555">${escapeXml(e.label)}</text>` : "";
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)"/>${label}`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <rect width="100%" height="100%" fill="${bg}"/>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#555"/>
    </marker>
  </defs>
  <title>Diagram ${spec.nodes.length} nodes, ${spec.edges.length} edges</title>
  ${edgesSvg}
  ${nodesSvg}
</svg>`;
  return svg;
}

export function renderToPngPlaceholder(spec: DiagramSpec): Buffer {
  // For v1 we return SVG as buffer; real PNG would use sharp/canvas
  const svg = renderToSvg(spec);
  return Buffer.from(svg, "utf8");
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function isValidSvg(svg: string): boolean {
  return typeof svg === "string" && svg.includes("<svg") && svg.includes("</svg>") && svg.includes('xmlns="http://www.w3.org/2000/svg"');
}
