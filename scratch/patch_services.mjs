import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const servicesDir = "d:/Ai Business/apps/api/src/services";

const files = execSync(`dir /s /b "${servicesDir}\\*.ts"`).toString().split('\n').map(f => f.trim()).filter(f => f.length > 0);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // For dataModelingAgent, estimationAgent, plannerAgent, processAgent, uxAgent, architectureAgent
  if (content.includes('import { getArtifact } from "../stores/artifacts";')) {
    content = content.replace('import { getArtifact } from "../stores/artifacts";', 'import { getRepositories } from "../repositories";');
    content = content.replace(/getArtifact\(([^,]+)\)/g, 'await getRepositories().artifacts.findById(orgId, $1)');
    changed = true;
  }
  
  if (content.includes('import { listEffortEstimates } from "../stores/effortEstimates";')) {
    content = content.replace('import { listEffortEstimates } from "../stores/effortEstimates";', '');
    content = content.replace(/listEffortEstimates\(([^,]+),([^)]+)\)/g, 'await getRepositories().dashboard.listEffortEstimates($1, $2)');
    changed = true;
  }

  if (content.includes('import { listMaturitySnapshots } from "../stores/maturitySnapshots";')) {
    content = content.replace('import { listMaturitySnapshots } from "../stores/maturitySnapshots";', '');
    content = content.replace(/listMaturitySnapshots\(([^,]+),([^)]+)\)/g, 'await getRepositories().dashboard.listMaturitySnapshots($1, $2)');
    changed = true;
  }

  if (content.includes('import { listRoadmapItems } from "../stores/roadmapItems";')) {
    content = content.replace('import { listRoadmapItems } from "../stores/roadmapItems";', '');
    content = content.replace(/listRoadmapItems\(([^,]+),([^)]+)\)/g, 'await getRepositories().dashboard.listRoadmapItems($1, $2)');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
  }
}
