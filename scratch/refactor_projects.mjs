import fs from 'fs';
import path from 'path';

const routesDir = 'd:\\Ai Business\\apps\\api\\src\\routes';
const files = [
  'exports.ts',
  'documents.ts',
  'dashboard.ts',
  'conversations.ts',
  'collaboration.ts',
  'artifacts.ts',
  'ai.ts',
  'admin.ts'
];

for (const file of files) {
  const p = path.join(routesDir, file);
  let content = fs.readFileSync(p, 'utf8');

  // Remove import { projects } from "./workspaces";
  content = content.replace(/import \{.*?projects.*?\} from "\.\/workspaces";/g, '');
  
  // Also remove if it's mixed like import { workspaces, projects } from ...
  content = content.replace(/import \{ projects, workspaces \} from "\.\/workspaces";/g, 'import { workspaces } from "./workspaces";');
  content = content.replace(/import \{ workspaces, projects \} from "\.\/workspaces";/g, 'import { workspaces } from "./workspaces";');

  // Ensure getRepositories is imported
  if (!content.includes('getRepositories')) {
    content = content.replace(/import \{ Router, Response \} from "express";/, 'import { Router, Response } from "express";\nimport { getRepositories } from "../repositories";');
  }

  // Make the route handler async
  content = content.replace(/\(req: AuthedRequest, res: Response\) => \{/g, 'async (req: AuthedRequest, res: Response) => {');

  // Replace proj = projects.get(...)
  content = content.replace(/const proj = projects\.get\((.*?)\);/g, 'const proj = await getRepositories().projects.findProjectById(orgId, $1);');
  content = content.replace(/const projCount = \[\.\.\.projects\.values\(\)\]\.filter\(\(p\) => p\.orgId === orgId\)\.length;/g, 'const projCount = (await getRepositories().projects.listWorkspaces(orgId)).length;');
  content = content.replace(/for \(const p of projects\.values\(\)\)/g, 'for (const p of await getRepositories().projects.listWorkspaces(orgId))');

  fs.writeFileSync(p, content, 'utf8');
  console.log(`Refactored ${file}`);
}
