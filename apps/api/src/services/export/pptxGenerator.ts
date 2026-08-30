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

    const entries = Object.entries(item).slice(0, 6); // Top entries per slide
    const rows: { text: string; options?: unknown }[][] = [
      [
        { text: "Attribute", options: { bold: true, fill: "0284C7", color: "FFFFFF" } },
        { text: "Description / Output", options: { bold: true, fill: "0284C7", color: "FFFFFF" } },
      ],
    ];

    for (const [k, v] of entries) {
      if (v === null || v === undefined) continue;
      const formatted = typeof v === "object" ? JSON.stringify(v) : String(v);
      rows.push([
        { text: k },
        { text: formatted.length > 200 ? formatted.substring(0, 197) + "..." : formatted },
      ]);
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
