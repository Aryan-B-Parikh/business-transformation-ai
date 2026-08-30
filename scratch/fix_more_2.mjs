import fs from 'fs';
import { execSync } from 'child_process';
const servicesDir = "d:/Ai Business/apps/api/src/services";
const files = execSync(`dir /s /b "${servicesDir}\\*.ts"`).toString().split('\n').map(f => f.trim()).filter(f => f.length > 0);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // fix return types for async agents
  content = content.replace(/export async function generate([A-Za-z]+)\(([^)]+)\):\s*\{\s*artifactId:\s*string;\s*content:\s*([A-Za-z]+);\s*\}\s*\{/g, 'export async function generate$1($2): Promise<{ artifactId: string; content: $3 }> {');
  // for estimationAgent
  content = content.replace(/export async function generate([A-Za-z]+)\(([^)]+)\):\s*\{\s*artifactId:\s*string;\s*content:\s*([A-Za-z]+);\s*estimateIds:\s*string\[\];\s*\}\s*\{/g, 'export async function generate$1($2): Promise<{ artifactId: string; content: $3; estimateIds: string[] }> {');
  // for plannerAgent
  content = content.replace(/export async function generate([A-Za-z]+)\(([^)]+)\):\s*\{\s*artifactId:\s*string;\s*content:\s*([A-Za-z]+);\s*roadmapItemIds:\s*string\[\];\s*\}\s*\{/g, 'export async function generate$1($2): Promise<{ artifactId: string; content: $3; roadmapItemIds: string[] }> {');
  
  // fix getRepositories path in export and webhook
  if (file.includes("export") || file.includes("webhook")) {
    content = content.replace('import { getRepositories } from "../repositories";', 'import { getRepositories } from "../../repositories";');
  }

  // fix diagramUrl, parentArtifactId, generatedBy
  content = content.replace(/\s*diagramUrl:\s*null,?\n/g, '\n');
  content = content.replace(/\s*parentArtifactId:\s*null,?\n/g, '\n');
  content = content.replace(/\s*generatedBy:\s*"[^"]+",?\n/g, '\n');

  // fix dashboard list functions
  if (file.endsWith("dashboard.ts") || file.endsWith("plannerAgent.ts") || file.endsWith("estimationAgent.ts")) {
    if (!content.includes('import { PrismaClient }')) {
      content = 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\n' + content;
    }
    content = content.replace(/await getRepositories\(\)\.dashboard\.listRoadmapItems\(projectId, orgId\)/g, 'await prisma.roadmapItem.findMany({ where: { projectId, orgId } })');
    content = content.replace(/await getRepositories\(\)\.dashboard\.listMaturitySnapshots\(projectId, orgId\)/g, 'await prisma.maturitySnapshot.findMany({ where: { projectId, orgId } })');
    content = content.replace(/await getRepositories\(\)\.dashboard\.listEffortEstimates\(projectId, orgId\)/g, 'await prisma.effortEstimate.findMany({ where: { projectId, orgId } })');
    content = content.replace(/await getRepositories\(\)\.dashboard\.createRoadmapItem\(/g, 'await prisma.roadmapItem.create({ data: ');
    content = content.replace(/await getRepositories\(\)\.dashboard\.createEffortEstimate\(/g, 'await prisma.effortEstimate.create({ data: ');
    content = content.replace(/\s*let\s+const\s+items\s*=\s*/g, 'const items = ');
  }

  // specific to dashboard
  if (file.endsWith("dashboard.ts")) {
     content = content.replace(/const snapshots: any\[\] = await getRepositories\(\)\.dashboard\.listMaturitySnapshots\(projectId, orgId\)/g, 'const snapshots: any[] = await prisma.maturitySnapshot.findMany({ where: { projectId, orgId } })');
     content = content.replace(/const items: any\[\] = await getRepositories\(\)\.dashboard\.listRoadmapItems\(projectId, orgId\)/g, 'const items: any[] = await prisma.roadmapItem.findMany({ where: { projectId, orgId } })');
     content = content.replace(/const efforts: any\[\] = await getRepositories\(\)\.dashboard\.listEffortEstimates\(projectId, orgId\)/g, 'const efforts: any[] = await prisma.effortEstimate.findMany({ where: { projectId, orgId } })');
     content = content.replace(/await getRepositories\(\)\.dashboard\.list/g, 'await prisma');
     // fix missing types
     content = content.replace(/reduce\(\(acc, item\)/g, 'reduce((acc: any, item: any)');
     content = content.replace(/reduce\(\(acc, snapshot\)/g, 'reduce((acc: any, snapshot: any)');
     content = content.replace(/reduce\(\(acc, effort\)/g, 'reduce((acc: any, effort: any)');
     content = content.replace(/map\(\(e\)/g, 'map((e: any)');
     content = content.replace(/map\(\(a\)/g, 'map((a: any)');
     // fix await not at top level error by checking if it's inside a function
     // The error is TS1308 at line 112: await getRepositories().dashboard...
     // That is likely generateDashboard() which was not async!
     content = content.replace(/export function generateDashboardMetrics/g, 'export async function generateDashboardMetrics');
     // wait there's also getAllEffortEstimates error
     content = content.replace(/getAllEffortEstimates\(\)/g, 'await prisma.effortEstimate.findMany()');
     content = content.replace(/listArtifacts\(/g, 'await getRepositories().artifacts.listByProject(');
  }

  // specific to plannerAgent, estimationAgent
  content = content.replace(/import \{ createRoadmapItem \} from "\.\.\/stores\/roadmapItems";/g, '');
  content = content.replace(/import \{ createEffortEstimate, RiskLevel \} from "\.\.\/stores\/effortEstimates";/g, '');
  
  if (content.includes("await prisma.roadmapItem.create({ data:")) {
      // it was called with ({...}) but now it's { data: {...} } so we need to add }
      // The original call was createRoadmapItem({...});
      // The regex `createRoadmapItem\(` is replaced by `await prisma.roadmapItem.create({ data: `
      // So the closing should be `});` which becomes `} });`
      // It's safer to just let the developer fix it manually if it fails, or do simple string replace:
      content = content.replace(/await prisma\.roadmapItem\.create\(\{\s*data:\s*\{([^}]+)\}\s*\)/g, 'await prisma.roadmapItem.create({ data: {$1} })');
  }

  // remove bad imports
  content = content.replace(/import \{ ExportFormat \} from ".*?";/g, '');
  content = content.replace(/import \{ WebhookConfig \} from ".*?";/g, '');
  
  fs.writeFileSync(file, content, 'utf8');
}
