import { z } from "zod";
import { generateStructuredCompletion } from "../ai/llmProvider";
import { getRepositories } from "../repositories";
import { getGroundingContext } from "./ragGrounding";
/**
 * Database & Integration Designer agent — TASK-016
 * POST /ai/v1/data-model/generate → ER diagram + REST API spec artifact
 * DoD: Generated schema is valid SQL DDL (parses without error); API spec is valid OpenAPI
 */

export const DataModelLLMSchema = z.object({
  erDiagram: z.object({ entities: z.array(z.object({ name: z.string(), fields: z.array(z.object({ name: z.string(), type: z.string(), pk: z.boolean().optional(), fk: z.string().optional() })) })), relations: z.array(z.object({ from: z.string(), to: z.string(), type: z.string() })) }),
  ddl: z.string().min(1),
  apiSpec: z.object({ openapi: z.string(), info: z.object({ title: z.string(), version: z.string() }), paths: z.record(z.unknown()) }),
  diagramSpec: z.object({ nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string() })), edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })) }),
});



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

function deterministicDataModel(domain: string): DataModelingContent {
  const entities = [{ name: "organizations", fields: [{ name: "id", type: "uuid", pk: true }, { name: "name", type: "text" }] }, { name: "users", fields: [{ name: "id", type: "uuid", pk: true }, { name: "orgId", type: "uuid", fk: "organizations.id" }, { name: "email", type: "text" }] }, { name: domain.toLowerCase() + "s", fields: [{ name: "id", type: "uuid", pk: true }, { name: "orgId", type: "uuid", fk: "organizations.id" }, { name: "name", type: "text" }] }];
  const relations = [{ from: "organizations", to: "users", type: "1:N" }, { from: "organizations", to: domain.toLowerCase() + "s", type: "1:N" }];
  const ddl = entities.map((e) => { const cols = e.fields.map((f) => `  "${f.name}" ${f.type.toUpperCase()}${f.pk ? " PRIMARY KEY" : ""}${f.fk ? ` REFERENCES ${f.fk}` : ""}`).join(",\n"); return `CREATE TABLE "${e.name}" (\n${cols}\n);`; }).join("\n\n");
  const apiSpec = { openapi: "3.0.0", info: { title: `${domain} API`, version: "1.0.0" }, paths: { [`/${domain.toLowerCase()}s`]: { get: { summary: `List ${domain}s`, responses: { "200": { description: "OK" } } }, post: { summary: `Create ${domain}`, responses: { "201": { description: "Created" } } } }, [`/${domain.toLowerCase()}s/{id}`]: { get: { summary: `Get ${domain}`, responses: { "200": { description: "OK" } } } } } };
  const diagramSpec = { nodes: entities.map((e) => ({ id: e.name, label: e.name, type: "entity" })), edges: relations.map((r) => ({ from: r.from, to: r.to, label: r.type })) };
  return { erDiagram: { entities, relations }, ddl, apiSpec, diagramSpec };
}

export async function generateDataModel(req: DataModelingRequest): Promise<{ artifactId: string; content: DataModelingContent }> {
  const domain = req.params?.domain || "Order";
  let content: DataModelingContent;
  const useLLM = process.env.OPENAI_API_KEY && process.env.LLM_PROVIDER !== "mock" && process.env.NODE_ENV !== "test";
  const grounding = await getGroundingContext(req.orgId, req.projectId, `data model ${domain}`, 5);
  if (useLLM) {
    try { content = await generateStructuredCompletion(`You are a Database & Integration Designer. Generate ER diagram, DDL, and OpenAPI for domain ${domain}. Return structured JSON only.`, `Generate data model for domain ${domain}.${grounding.contextBlock}`, DataModelLLMSchema, { model: "gpt-4o-mini", orgId: req.orgId }); } catch { content = deterministicDataModel(domain); }
  } else content = deterministicDataModel(domain);

  const artifact = await getRepositories().artifacts.create(req.orgId, req.projectId, {
    type: "er_diagram",
    title: `Data Model — ${domain}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
    createdBy: req.createdBy,
  });

  return { artifactId: artifact.id, content };
}

export interface ApiSpecContent {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, unknown>;
}

function deterministicApiSpec(domain: string): ApiSpecContent {
  return {
    openapi: "3.0.0",
    info: { title: `${domain} API`, version: "1.0.0" },
    paths: {
      [`/${domain.toLowerCase()}s`]: {
        get: { summary: `List ${domain}s`, responses: { "200": { description: "OK" } } },
        post: { summary: `Create ${domain}`, responses: { "201": { description: "Created" } } },
      },
      [`/${domain.toLowerCase()}s/{id}`]: {
        get: { summary: `Get ${domain}`, responses: { "200": { description: "OK" } } },
        put: { summary: `Update ${domain}`, responses: { "200": { description: "OK" } } },
        delete: { summary: `Delete ${domain}`, responses: { "204": { description: "No Content" } } },
      },
    },
  };
}

export async function generateApiSpec(req: DataModelingRequest): Promise<{ artifactId: string; content: ApiSpecContent }> {
  const domain = req.params?.domain || "Order";
  let content: ApiSpecContent;
  const useLLM = process.env.OPENAI_API_KEY && process.env.LLM_PROVIDER !== "mock" && process.env.NODE_ENV !== "test";
  const grounding = await getGroundingContext(req.orgId, req.projectId, `api spec ${domain}`, 5);
  if (useLLM) {
    try { content = await generateStructuredCompletion(`You are an API Designer. Generate OpenAPI 3.0 spec for domain ${domain}. Return structured JSON only.`, `Generate API spec for domain ${domain}.${grounding.contextBlock}`, z.object({ openapi: z.string(), info: z.object({ title: z.string(), version: z.string() }), paths: z.record(z.unknown()) }), { model: "gpt-4o-mini", orgId: req.orgId }); } catch { content = deterministicApiSpec(domain); }
  } else content = deterministicApiSpec(domain);

  const artifact = await getRepositories().artifacts.create(req.orgId, req.projectId, {
    type: "api_spec",
    title: `API Spec — ${domain}`,
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
