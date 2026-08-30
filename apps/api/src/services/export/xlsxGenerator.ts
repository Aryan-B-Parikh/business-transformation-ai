import ExcelJS from "exceljs";

export async function generateXlsx(
  title: string,
  metadata: { orgId: string; artifactId?: string; projectId?: string },
  content: Record<string, unknown> | Record<string, unknown>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Business Transformation AI";
  workbook.created = new Date();

  // Summary Sheet
  const summarySheet = workbook.addWorksheet("Overview");
  summarySheet.columns = [
    { header: "Field", key: "field", width: 30 },
    { header: "Value", key: "value", width: 60 },
  ];

  summarySheet.addRow({ field: "Document Title", value: title });
  summarySheet.addRow({ field: "Organization ID", value: metadata.orgId });
  summarySheet.addRow({ field: "Artifact ID", value: metadata.artifactId ?? "N/A" });
  summarySheet.addRow({ field: "Project ID", value: metadata.projectId ?? "N/A" });
  summarySheet.addRow({ field: "Exported At", value: new Date().toISOString() });

  summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summarySheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };

  // Content Sheets
  const items = Array.isArray(content) ? content : [content];

  items.forEach((item, idx) => {
    const sheetName = items.length === 1 ? "Artifact Details" : `Section ${idx + 1}`;
    const sheet = workbook.addWorksheet(sheetName.substring(0, 31)); // Excel 31 char limit

    sheet.columns = [
      { header: "Property", key: "property", width: 25 },
      { header: "Details / Content", key: "details", width: 75 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0284C7" },
    };

    for (const [k, v] of Object.entries(item)) {
      if (v === null || v === undefined) continue;
      const formatted = typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
      sheet.addRow({ property: k, details: formatted });
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
