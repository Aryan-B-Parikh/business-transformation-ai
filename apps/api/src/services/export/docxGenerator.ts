import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

export async function generateDocx(
  title: string,
  metadata: { orgId: string; artifactId?: string; projectId?: string },
  content: Record<string, unknown> | Record<string, unknown>[]
): Promise<Buffer> {
  const sectionsChildren: (Paragraph | Table)[] = [];

  // Title
  sectionsChildren.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  // Metadata Paragraph
  sectionsChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Organization: ${metadata.orgId}  |  Generated: ${new Date().toISOString()}`,
          color: "64748B",
          size: 18,
        }),
      ],
      spacing: { after: 300 },
    })
  );

  const renderDataToDocx = (data: Record<string, unknown>, sectionTitle?: string) => {
    if (sectionTitle) {
      sectionsChildren.push(
        new Paragraph({
          text: sectionTitle,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 150 },
        })
      );
    }

    const rows: TableRow[] = [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Key", bold: true })] })],
            width: { size: 30, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true })] })],
            width: { size: 70, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
    ];

    // Structured handling for known artifact shapes
    if (Array.isArray((data as Record<string, unknown>).hldSections)) {
      for (const s of (data as Record<string, unknown>).hldSections as Array<{title:string;description:string}>) {
        rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: `HLD: ${s.title}`, })] }), new TableCell({ children: [new Paragraph({ text: s.description })] })] }));
      }
    }
    if ((data as Record<string, unknown>).diagramSpec) {
      const spec = (data as Record<string, unknown>).diagramSpec as { nodes?: unknown[]; edges?: unknown[] };
      rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: "Diagram" })] }), new TableCell({ children: [new Paragraph({ text: `${Array.isArray(spec.nodes)?spec.nodes.length:0} nodes, ${Array.isArray(spec.edges)?spec.edges.length:0} edges` })] })] }));
    }
    for (const [key, val] of Object.entries(data)) {
      if (["hldSections","lldSections","diagramSpec"].includes(key)) continue;
      if (val === null || val === undefined) continue;
      const formattedVal = typeof val === "object" ? JSON.stringify(val, null, 2).slice(0,3000) : String(val);
      rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: key })] }), new TableCell({ children: [new Paragraph({ text: formattedVal })] })] }));
    }

    sectionsChildren.push(
      new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );

    sectionsChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  };

  if (Array.isArray(content)) {
    content.forEach((item, idx) => renderDataToDocx(item, `Artifact Section ${idx + 1}`));
  } else {
    renderDataToDocx(content);
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: sectionsChildren,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
