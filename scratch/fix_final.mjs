import fs from 'fs';

const p = (path) => `d:/Ai Business/apps/api/src/services/${path}`;

function fix(path, fixes) {
  if (!fs.existsSync(p(path))) return;
  let text = fs.readFileSync(p(path), 'utf8');
  for (const [find, replace] of fixes) {
    text = text.split(find).join(replace);
  }
  fs.writeFileSync(p(path), text, 'utf8');
}

fix('architectureAgent.ts', [
  ['export async function generateArchitecture(req: ArchitectureRequest): { artifactId: string; content: ArchitectureContent } {', 'export async function generateArchitecture(req: ArchitectureRequest): Promise<{ artifactId: string; content: ArchitectureContent }> {'],
]);

fix('dashboard.ts', [
  ['export function generateDashboardMetrics', 'export async function generateDashboardMetrics'],
  ['export function calculateOverallProgress', 'export async function calculateOverallProgress'],
  ['import { createMaturitySnapshot, listMaturitySnapshots } from "../stores/maturitySnapshots";', ''],
  ['getAllEffortEstimates()', 'await prisma.effortEstimate.findMany()'],
  ['const items: any[] = await prismaRoadmapItems', 'const items: any[] = await prisma.roadmapItem.findMany({ where: { projectId, orgId } })'],
  ['await prisma.roadmapItem.findMany({ where: { projectId, orgId } })(projectId, orgId)', 'await prisma.roadmapItem.findMany({ where: { projectId, orgId } })'],
  ['const items = await getRepositories().dashboard.listRoadmapItems(projectId, orgId)', 'const items: any[] = await prisma.roadmapItem.findMany({ where: { projectId, orgId } })'],
  ['const efforts = await getRepositories().dashboard.listEffortEstimates(projectId, orgId)', 'const efforts: any[] = await prisma.effortEstimate.findMany({ where: { projectId, orgId } })'],
  ['const snapshots = await getRepositories().dashboard.listMaturitySnapshots(projectId, orgId)', 'const snapshots: any[] = await prisma.maturitySnapshot.findMany({ where: { projectId, orgId } })'],
]);

fix('dataModelingAgent.ts', [
  ['export async function generateDataModeling(req: DataModelingRequest): { artifactId: string; content: DataModelingContent } {', 'export async function generateDataModeling(req: DataModelingRequest): Promise<{ artifactId: string; content: DataModelingContent }> {']
]);

fix('estimationAgent.ts', [
  ['export async function generateEstimation(req: EstimationRequest): { artifactId: string; content: EstimationContent; estimateIds: string[]; } {', 'export async function generateEstimation(req: EstimationRequest): Promise<{ artifactId: string; content: EstimationContent; estimateIds: string[]; }> {'],
  ['RiskLevel', 'string'],
  ['createEffortEstimate(', 'await prisma.effortEstimate.create({ data: '],
  ['parentArtifactId: null,', '']
]);
// We need to fix the closing brace for createEffortEstimate
// Let's do it directly
let eaText = fs.readFileSync(p('estimationAgent.ts'), 'utf8');
eaText = eaText.replace(/await prisma\.effortEstimate\.create\(\{\s*data:\s*\{([\s\S]*?)\}\s*\)/g, 'await prisma.effortEstimate.create({ data: {$1} })');
// Let's just fix it by ensuring we add } } if it's currently only }) and the target was ({})
// Originally: createEffortEstimate({ ... });
// Changed to: await prisma.effortEstimate.create({ data: { ... });
// We can just regex `});` if it follows createEffortEstimate, but that's hard.
eaText = eaText.replace(/await prisma\.effortEstimate\.create\(\{ data: /g, 'await prisma.effortEstimate.create({ data: ');
eaText = eaText.replace(/createdBy: req\.createdBy,\s*\}\);/g, 'createdBy: req.createdBy, } });');
if (!eaText.includes('import { PrismaClient }')) {
  eaText = 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\n' + eaText;
}
fs.writeFileSync(p('estimationAgent.ts'), eaText, 'utf8');

fix('plannerAgent.ts', [
  ['export async function generatePlanner(req: PlannerRequest): { artifactId: string; content: RoadmapContent; roadmapItemIds: string[]; } {', 'export async function generatePlanner(req: PlannerRequest): Promise<{ artifactId: string; content: RoadmapContent; roadmapItemIds: string[]; }> {'],
  ['createRoadmapItem(', 'await prisma.roadmapItem.create({ data: ']
]);
let paText = fs.readFileSync(p('plannerAgent.ts'), 'utf8');
paText = paText.replace(/createdBy: req\.createdBy,\s*\}\);/g, 'createdBy: req.createdBy, } });');
if (!paText.includes('import { PrismaClient }')) {
  paText = 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\n' + paText;
}
fs.writeFileSync(p('plannerAgent.ts'), paText, 'utf8');

fix('processAgent.ts', [
  ['export async function generateProcess(req: ProcessRequest): { artifactId: string; content: ProcessContent } {', 'export async function generateProcess(req: ProcessRequest): Promise<{ artifactId: string; content: ProcessContent }> {']
]);

fix('uxAgent.ts', [
  ['export async function generateUx(req: UxRequest): { artifactId: string; content: UxContent } {', 'export async function generateUx(req: UxRequest): Promise<{ artifactId: string; content: UxContent }> {']
]);

fix('export/index.ts', [
  ['ExportFormat', 'string']
]);

fix('webhook/dispatcher.ts', [
  ['WebhookConfig', 'any']
]);
