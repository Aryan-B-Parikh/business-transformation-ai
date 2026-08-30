import fs from 'fs';

const servicesDir = "d:/Ai Business/apps/api/src/services";
const files = [
  "approvals.ts",
  "architectureAgent.ts",
  "collaboration.ts",
  "dashboard.ts",
  "dataModelingAgent.ts",
  "estimationAgent.ts",
  "plannerAgent.ts",
  "processAgent.ts",
  "uxAgent.ts"
];

for (const f of files) {
  const filepath = `${servicesDir}/${f}`;
  if (!fs.existsSync(filepath)) continue;
  let content = fs.readFileSync(filepath, 'utf8');
  let changed = false;

  // fix createArtifact
  if (content.includes('createArtifact({')) {
    content = content.replace('createArtifact({', 'await getRepositories().artifacts.create(req.orgId, req.projectId, {');
    // also need to remove projectId and orgId from the object passed
    content = content.replace(/\s*projectId:\s*req\.projectId,?\n/, '\n');
    content = content.replace(/\s*orgId:\s*req\.orgId,?\n/, '\n');
    changed = true;
  }
  
  // change export function to export async function
  if (changed) {
    content = content.replace(/export function generate/g, 'export async function generate');
  }

  if (changed) {
    fs.writeFileSync(filepath, content, 'utf8');
  }
}
