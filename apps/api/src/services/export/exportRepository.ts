import { PrismaClientType } from "../../repositories/postgres";

export interface ExportRecord {
  id: string; orgId: string; projectId: string; format: string;
  status: "queued" | "completed" | "failed"; storageKey?: string;
  createdAt: Date; completedAt?: Date; error?: string;
}
export interface IExportRepository {
  create(input: Omit<ExportRecord, "createdAt" | "status"> & { status?: ExportRecord["status"] }): Promise<ExportRecord>;
  complete(id: string, storageKey: string): Promise<void>;
  fail(id: string, error: string): Promise<void>;
  getById(id: string, orgId: string): Promise<ExportRecord | null>;
}
export class PostgresExportRepository implements IExportRepository {
  constructor(private readonly prisma: PrismaClientType) {}
  async create(input: Omit<ExportRecord, "createdAt" | "status"> & { status?: ExportRecord["status"] }): Promise<ExportRecord> {
    const row = await (this.prisma as any).export.create({ data: { id: input.id, orgId: input.orgId, projectId: input.projectId, format: input.format, status: input.status ?? "queued" } });
    return row as ExportRecord;
  }
  async complete(id: string, storageKey: string): Promise<void> { await (this.prisma as any).export.update({ where: { id }, data: { status: "completed", storageKey, completedAt: new Date() } }); }
  async fail(id: string, error: string): Promise<void> { await (this.prisma as any).export.update({ where: { id }, data: { status: "failed", error } }); }
  async getById(id: string, orgId: string): Promise<ExportRecord | null> { return ((await (this.prisma as any).export.findFirst({ where: { id, orgId } })) as ExportRecord | null); }
}

/** Memory persistence exists only to keep unit tests independent of PostgreSQL. */
export class MemoryExportRepository implements IExportRepository {
  private readonly records = new Map<string, ExportRecord>();
  async create(input: Omit<ExportRecord, "createdAt" | "status"> & { status?: ExportRecord["status"] }): Promise<ExportRecord> {
    const record: ExportRecord = { ...input, status: input.status ?? "queued", createdAt: new Date() };
    this.records.set(record.id, record); return record;
  }
  async complete(id: string, storageKey: string): Promise<void> { const r = this.records.get(id); if (!r) throw new Error("Export not found"); r.status = "completed"; r.storageKey = storageKey; r.completedAt = new Date(); }
  async fail(id: string, error: string): Promise<void> { const r = this.records.get(id); if (!r) throw new Error("Export not found"); r.status = "failed"; r.error = error; }
  async getById(id: string, orgId: string): Promise<ExportRecord | null> { const r = this.records.get(id); return r && r.orgId === orgId ? r : null; }
}
