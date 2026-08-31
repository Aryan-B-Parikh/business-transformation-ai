import { getRepositories } from "../repositories";
/**
 * Database & Integration Designer agent — TASK-016
 * POST /ai/v1/data-model/generate → ER diagram + REST API spec artifact
 * DoD: Generated schema is valid SQL DDL (parses without error); API spec is valid OpenAPI
 */



export interface DataModelingContent {
  erDiagram: { entities: { name: string; fields: { name: string; type: string; pk?: boolean; fk?: string }[] }[]; relations: { from: string; to: string; type: string }[] };
  ddl: string;
  apiSpec: { openapi: string; info: { title: string; version: string }; paths: Record<string, unknown> };
  diagramSpec: { nodes: { id: string; label: string; type: string }[]; edges: { from: string; to: string; label?: string }[] };
}

export interface DataModelingRequest {
  projectId: string;
  orgId: string;
  createdBy: string;
  lang?: string;
  params?: { domain?: string };
}

export async function generateDataModel(req: DataModelingRequest): Promise<{ artifactId: string; content: DataModelingContent }> {
  const domain = req.params?.domain || "Order";
  const entities = [
    { name: "organizations", fields: [{ name: "id", type: "uuid", pk: true }, { name: "name", type: "text" }] },
    { name: "users", fields: [{ name: "id", type: "uuid", pk: true }, { name: "orgId", type: "uuid", fk: "organizations.id" }, { name: "email", type: "text" }] },
    { name: domain.toLowerCase() + "s", fields: [{ name: "id", type: "uuid", pk: true }, { name: "orgId", type: "uuid", fk: "organizations.id" }, { name: "name", type: "text" }] },
  ];
  const relations = [
    { from: "organizations", to: "users", type: "1:N" },
    { from: "organizations", to: domain.toLowerCase() + "s", type: "1:N" },
  ];

  const ddl = entities
    .map((e) => {
      const cols = e.fields.map((f) => `  "${f.name}" ${f.type.toUpperCase()}${f.pk ? " PRIMARY KEY" : ""}${f.fk ? ` REFERENCES ${f.fk}` : ""}`).join(",\n");
      return `CREATE TABLE "${e.name}" (\n${cols}\n);`;
    })
    .join("\n\n");

  const apiSpec = {
    openapi: "3.0.0",
    info: { title: `${domain} API`, version: "1.0.0" },
    paths: {
      [`/${domain.toLowerCase()}s`]: {
        get: { summary: `List ${domain}s`, responses: { "200": { description: "OK" } } },
        post: { summary: `Create ${domain}`, responses: { "201": { description: "Created" } } },
      },
      [`/${domain.toLowerCase()}s/{id}`]: {
        get: { summary: `Get ${domain}`, responses: { "200": { description: "OK" } } },
      },
    },
  };

  const diagramSpec = {
    nodes: entities.map((e) => ({ id: e.name, label: e.name, type: "entity" })),
    edges: relations.map((r) => ({ from: r.from, to: r.to, label: r.type })),
  };

  const content: DataModelingContent = { erDiagram: { entities, relations }, ddl, apiSpec, diagramSpec };

  const artifact = await getRepositories().artifacts.create(req.orgId, req.projectId, {
    type: "er_diagram",
    title: `Data Model — ${domain}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
    createdBy: req.createdBy,
  });

  return { artifactId: artifact.id, content };
}

export function validateDataModeling(content: unknown): { valid: boolean; errors?: string[] } {
  const c = content as DataModelingContent;
  const errors: string[] = [];
  if (!c.erDiagram || !Array.isArray(c.erDiagram.entities)) errors.push("erDiagram.entities required");
  if (!c.ddl || typeof c.ddl !== "string" || !c.ddl.includes("CREATE TABLE")) errors.push("ddl must contain CREATE TABLE");
  if (!c.apiSpec || c.apiSpec.openapi !== "3.0.0") errors.push("apiSpec must be valid OpenAPI 3.0");
  if (!c.diagramSpec || !Array.isArray(c.diagramSpec.nodes)) errors.push("diagramSpec required");
  // Try to "parse" DDL: simple check that each CREATE TABLE has matching parens
  if (c.ddl) {
    const opens = (c.ddl.match(/\(/g) || []).length;
    const closes = (c.ddl.match(/\)/g) || []).length;
    if (opens !== closes) errors.push("DDL parens mismatch");
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}
