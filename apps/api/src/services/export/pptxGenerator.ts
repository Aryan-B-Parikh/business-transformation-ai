import pptxgen from "pptxgenjs";

export async function generatePptx(
  title: string,
  metadata: { orgId: string; artifactId?: string; projectId?: string },
  content: Record<string, unknown> | Record<string, unknown>[]
): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";

  // Title Slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: "0F172A" };

  titleSlide.addText(title, {
    x: 1,
    y: 2.5,
    w: "80%",
    h: 1.5,
    fontSize: 32,
    color: "FFFFFF",
    bold: true,
    fontFace: "Arial",
  });

  titleSlide.addText(
    `Organization: ${metadata.orgId}\nGenerated: ${new Date().toLocaleDateString()}`,
    {
      x: 1,
      y: 4.5,
      w: "80%",
      h: 1,
      fontSize: 14,
      color: "94A3B8",
      fontFace: "Arial",
    }
  );

  // Content Slides
  const items = Array.isArray(content) ? content : [content];

  items.forEach((item, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: "F8FAFC" };

    const slideTitle = items.length === 1 ? "Artifact Overview" : `Artifact Summary — Part ${idx + 1}`;
    slide.addText(slideTitle, {
      x: 0.8,
      y: 0.6,
      w: "90%",
      h: 0.8,
      fontSize: 22,
      color: "0F172A",
      bold: true,
      fontFace: "Arial",
    });

    // Prioritize structured fields for slide
    const priorityKeys = ["hldSections","lldSections","components","integrations","diagramSpec","erDiagram","bpmnJson","screens","phases"];
    const orderedEntries = [...Object.entries(item)].sort((a,b)=> {
      const ai = priorityKeys.indexOf(a[0]); const bi = priorityKeys.indexOf(b[0]);
      if(ai===-1 && bi===-1) return 0; if(ai===-1) return 1; if(bi===-1) return -1; return ai-bi;
    }).slice(0, 8);
    const rows: any[] = [[{ text: "Attribute", options: { bold: true, fill: "0284C7", color: "FFFFFF" } }, { text: "Description / Output", options: { bold: true, fill: "0284C7", color: "FFFFFF" } }]];
    for (const [k, v] of orderedEntries) {
      if (v === null || v === undefined) continue;
      let formatted: string;
      if(k==="diagramSpec" && typeof v==="object"){ const spec=v as {nodes?:unknown[];edges?:unknown[]}; formatted=`${Array.isArray(spec.nodes)?spec.nodes.length:0} nodes, ${Array.isArray(spec.edges)?spec.edges.length:0} edges`; }
      else if(Array.isArray(v) && (k==="hldSections"||k==="lldSections")){ formatted=(v as Array<{title:string}>).map(s=>s.title).join(", ").slice(0,300); }
      else formatted = typeof v === "object" ? JSON.stringify(v) : String(v);
      rows.push([{ text: k }, { text: formatted.length > 300 ? formatted.substring(0, 297) + "..." : formatted }]);
    }

    slide.addTable(rows, {
      x: 0.8,
      y: 1.6,
      w: 8.4,
      fontSize: 11,
      color: "334155",
      border: { pt: 1, color: "CBD5E1" },
    });
  });

  const arrayBuffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return arrayBuffer;
}
