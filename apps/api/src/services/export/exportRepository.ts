import { PrismaClientType } from "../../repositories/postgres";

export interface ExportRecord {
  id: string;
  orgId: string;
  projectId: string;
  format: string;
  status: "queued" | "completed" | "failed";
  storageKey?: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface IExportRepository {
  create(input: Omit<ExportRecord, "createdAt" | "status"> & { status?: ExportRecord["status"] }): Promise<ExportRecord>;
  complete(id: string, storageKey: string): Promise<void>;
  fail(id: string, error: string): Promise<void>;
  getById(id: string, orgId: string): Promise<ExportRecord | null>;
}

/** Production adapter. Kept isolated so export generation never owns persistence. */
export class PostgresExportRepository implements IExportRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async create(input: Omit<ExportRecord, "createdAt" | "status"> & { status?: ExportRecord["status"] }): Promise<ExportRecord> {
    const row = await (this.prisma as any).export.create({ data: { id: input.id, orgId: input.orgId, projectId: input.projectId, format: input.format, status: input.status ?? "queued" } });
    return { ...row, orgId: row.orgId, projectId: row.projectId, format: row.format, status: row.status };
  }

  async complete(id: string, storageKey: string): Promise<void> {
    await (this.prisma as any).export.update({ where: { id }, data: { status: "completed", storageKey, completedAt: new Date() } });
  }

  async fail(id: string, error: string): Promise<void> {
    await (this.prisma as any).export.update({ where: { id }, data: { status: "failed", error } });
  }

  async getById(id: string, orgId: string): Promise<ExportRecord | null> {
    const row = await (this.prisma as any).export.findFirst({ where: { id, orgId } });
    return row ? { ...row, orgId: row.orgId, projectId: row.projectId, format: row.format, status: row.status } : null;
  }
}
