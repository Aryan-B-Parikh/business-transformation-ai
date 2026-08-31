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

type LayoutKind = "flow" | "lanes" | "er";

function detectLayout(spec: DiagramSpec): LayoutKind {
  if (spec.nodes.some((n) => n.type === "startEvent" || n.type === "endEvent" || n.type === "exclusiveGateway" || n.type === "task")) return "lanes";
  if (spec.nodes.some((n) => n.type === "entity")) return "er";
  return "flow";
}

export function renderToSvg(spec: DiagramSpec, opts: RenderOptions = {}): string {
  if (!spec || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
    throw new Error("Invalid diagramSpec: nodes/edges required");
  }
  if (spec.nodes.length === 0) throw new Error("diagramSpec.nodes must have at least 1 node");

  const width = opts.width || 900;
  const kind = detectLayout(spec);
  const height = opts.height || (kind === "lanes" ? Math.max(260, spec.nodes.length * 70 + 120) : Math.max(220, Math.ceil(spec.nodes.length / 3) * 130 + 120));
  const bg = opts.bg || "#ffffff";

  const nodePos = new Map<string, { x: number; y: number; w: number; h: number }>();
  if (kind === "lanes") {
    // Lane-aware horizontal flow: preserve lane grouping visually
    const uniqueLanes = [...new Set(spec.nodes.map((n) => (n as unknown as { lane?: string }).lane).filter(Boolean))] as string[];
    spec.nodes.forEach((n, i) => {
      const laneIdx = uniqueLanes.indexOf((n as unknown as { lane?: string }).lane || uniqueLanes[0] || "");
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 80 + col * 260;
      const y = 70 + row * 110 + laneIdx * 6;
      const isGateway = n.type === "exclusiveGateway" || n.type === "gateway";
      nodePos.set(n.id, { x, y, w: isGateway ? 90 : 180, h: isGateway ? 60 : 50 });
    });
  } else if (kind === "er") {
    spec.nodes.forEach((n, i) => {
      const x = 90 + (i % 3) * 250;
      const y = 60 + Math.floor(i / 3) * 140;
      nodePos.set(n.id, { x, y, w: 200, h: 70 });
    });
  } else {
    spec.nodes.forEach((n, i) => {
      const x = 100 + (i % 3) * 240;
      const y = 60 + Math.floor(i / 3) * 130;
      nodePos.set(n.id, { x, y, w: 180, h: 50 });
    });
  }

  const nodesSvg = spec.nodes
    .map((n) => {
      const pos = nodePos.get(n.id)!;
      const isGateway = n.type === "exclusiveGateway" || n.type === "gateway";
      const isEvent = n.type === "startEvent" || n.type === "endEvent";
      const isEntity = n.type === "entity";
      const isDashboard = n.type === "dashboard";
      let fill = "#e9ecef";
      let stroke = "#333";
      if (isGateway) { fill = "#fff3cd"; stroke = "#b58900"; }
      else if (isEntity) { fill = "#d1ecf1"; stroke = "#0c7a8a"; }
      else if (isDashboard) { fill = "#d4edda"; stroke = "#2d6a4f"; }
      else if (isEvent) { fill = kind === "lanes" ? "#fff" : "#e9ecef"; stroke = "#555"; }
      if (isGateway) {
        const cx = pos.x + pos.w / 2, cy = pos.y + pos.h / 2;
        const s = 36;
        return `<g data-node-id="${escapeXml(n.id)}"><polygon points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#000">${escapeXml(truncate(n.label, 18))}</text><text x="${cx}" y="${cy + 52}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#555">${escapeXml(n.type || "")}</text></g>`;
      }
      if (isEvent) {
        const rx = isEvent ? 25 : 6;
        return `<g data-node-id="${escapeXml(n.id)}"><rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${isEvent ? 2 : 1.5}"/><text x="${pos.x + pos.w / 2}" y="${pos.y + 28}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="${isEvent ? 600 : 400}" fill="#000">${escapeXml(truncate(n.label, 20))}</text><text x="${pos.x + pos.w / 2}" y="${pos.y + 42}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#555">${escapeXml(n.type || "")}</text></g>`;
      }
      if (isEntity) {
        return `<g data-node-id="${escapeXml(n.id)}"><rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="18" rx="4" fill="#0c7a8a"/><text x="${pos.x + pos.w / 2}" y="${pos.y + 13}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="600" fill="#fff">${escapeXml(truncate(n.label, 22))}</text><text x="${pos.x + 8}" y="${pos.y + 32}" font-family="monospace" font-size="8" fill="#333">id: uuid  •  org_id: uuid</text><text x="${pos.x + 8}" y="${pos.y + 44}" font-family="monospace" font-size="8" fill="#666">created_at: timestamptz</text></g>`;
      }
      return `<g data-node-id="${escapeXml(n.id)}"><rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><text x="${pos.x + pos.w / 2}" y="${pos.y + 30}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#000">${escapeXml(truncate(n.label, 20))}</text></g>`;
    })
    .join("\n");

  const edgesSvg = spec.edges
    .map((e) => {
      const from = nodePos.get(e.from);
      const to = nodePos.get(e.to);
      if (!from || !to) return "";
      const x1 = from.x + from.w / 2;
      const y1 = from.y + from.h;
      const x2 = to.x + to.w / 2;
      const y2 = to.y;
      // Curved elbow via path for lanes, straight otherwise
      const isCurved = kind === "lanes" && Math.abs(x1 - x2) > 80;
      const d = isCurved
        ? `M ${x1} ${y1} C ${x1} ${y1 + 30}, ${x2} ${y2 - 30}, ${x2} ${y2}`
        : `M ${x1} ${y1} L ${x2} ${y2}`;
      const label = e.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#555" paint-order="stroke" stroke="#fff" stroke-width="3">${escapeXml(e.label)}</text>` : "";
      return `<path d="${d}" fill="none" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)"/>${label}`;
    })
    .join("\n");

  const laneBar = kind === "lanes" ? (() => {
    const uniqueLanes = [...new Set(spec.nodes.map((n) => (n as unknown as { lane?: string }).lane).filter(Boolean))] as string[];
    if (uniqueLanes.length === 0) return "";
    return `<g font-family="sans-serif" font-size="10" fill="#6b7280">${uniqueLanes.map((lane, i) => `<text x="12" y="${86 + i * 14}">${escapeXml(lane)}</text>`).join("")}</g>`;
  })() : "";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <rect width="100%" height="100%" fill="${bg}"/>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#555"/>
    </marker>
  </defs>
  <title>Diagram ${spec.nodes.length} nodes, ${spec.edges.length} edges — ${escapeXml(kind)}</title>
  ${laneBar}
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

function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function isValidSvg(svg: string): boolean {
  return typeof svg === "string" && svg.includes("<svg") && svg.includes("</svg>") && svg.includes('xmlns="http://www.w3.org/2000/svg"');
}
