import PDFDocument from "pdfkit";

export async function generatePdf(
  title: string,
  metadata: { orgId: string; artifactId?: string; projectId?: string },
  content: Record<string, unknown> | Record<string, unknown>[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    // Header banner & title
    doc
      .fontSize(22)
      .fillColor("#1e293b")
      .text(title, { align: "left" })
      .moveDown(0.5);

    // Subtitle / Metadata
    doc
      .fontSize(10)
      .fillColor("#64748b")
      .text(`Organization: ${metadata.orgId}  |  Generated: ${new Date().toISOString()}`)
      .text(
        metadata.artifactId
          ? `Artifact ID: ${metadata.artifactId}`
          : `Project ID: ${metadata.projectId ?? "N/A"}`
      )
      .moveDown(1);

    doc
      .strokeColor("#cbd5e1")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke()
      .moveDown(1);

    // Content sections
    const renderContentBlock = (data: Record<string, unknown>, heading?: string) => {
      if (heading) {
        doc.fontSize(14).fillColor("#0f172a").text(heading).moveDown(0.5);
      }

      for (const [key, val] of Object.entries(data)) {
        if (val === null || val === undefined) continue;

        doc.fontSize(11).fillColor("#334155").text(`${key}: `, { continued: true });

        if (typeof val === "object") {
          doc.fillColor("#475569").text("\n" + JSON.stringify(val, null, 2)).moveDown(0.5);
        } else {
          doc.fillColor("#0f172a").text(String(val)).moveDown(0.3);
        }
      }
      doc.moveDown(0.5);
    };

    if (Array.isArray(content)) {
      content.forEach((item, idx) => renderContentBlock(item, `Section ${idx + 1}`));
    } else {
      renderContentBlock(content);
    }

    // Page Numbering Footer
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor("#94a3b8")
        .text(
          `Business Transformation AI — Page ${i + 1} of ${range.count}`,
          50,
          doc.page.height - 40,
          { align: "center" }
        );
    }

    doc.end();
  });
}
