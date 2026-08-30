import fs from 'fs';
import { execSync } from 'child_process';
const servicesDir = "d:/Ai Business/apps/api/src/services";
const files = execSync(`dir /s /b "${servicesDir}\\*.ts"`).toString().split('\n').map(f => f.trim()).filter(f => f.length > 0);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // fix duplicates
  while (content.includes("import { getRepositories } from \"../repositories\";\nimport { getRepositories } from \"../repositories\";")) {
    content = content.replace("import { getRepositories } from \"../repositories\";\nimport { getRepositories } from \"../repositories\";", "import { getRepositories } from \"../repositories\";");
    changed = true;
  }
  
  if (content.match(/import \{ getRepositories \} from "\.\.\/repositories";(\r?\n)import \{ getRepositories \} from "\.\.\/repositories";/)) {
    content = content.replace(/import \{ getRepositories \} from "\.\.\/repositories";(\r?\n)import \{ getRepositories \} from "\.\.\/repositories";/g, 'import { getRepositories } from "../repositories";');
    changed = true;
  }
  
  // replace stores with getRepositories for anything remaining
  const storesRegex = /import\s+\{([^}]+)\}\s+from\s+"(?:..\/)*stores\/([^"]+)";/g;
  let match;
  while ((match = storesRegex.exec(content)) !== null) {
     if (!content.includes('import { getRepositories }')) {
        content = 'import { getRepositories } from "../repositories";\n' + content;
     }
     content = content.replace(match[0], '');
     changed = true;
  }

  // specific files
  if (file.endsWith("dashboard.ts")) {
    content = content.replace(/listEffortEstimates\(projectId,\s*orgId\)/g, 'await getRepositories().dashboard.listEffortEstimates(projectId, orgId)');
    content = content.replace(/listMaturitySnapshots\(projectId,\s*orgId\)/g, 'await getRepositories().dashboard.listMaturitySnapshots(projectId, orgId)');
    content = content.replace(/listRoadmapItems\(projectId,\s*orgId\)/g, 'await getRepositories().dashboard.listRoadmapItems(projectId, orgId)');
    // fix await not at top level (if any map has await)
    // Actually listMaturitySnapshots etc were arrays, now they are promises, we need to await them
    content = content.replace(/const items = await getRepositories\(\)\.dashboard\.listRoadmapItems\(/g, 'const items: any[] = await getRepositories().dashboard.listRoadmapItems(');
    content = content.replace(/const snapshots = await getRepositories\(\)\.dashboard\.listMaturitySnapshots\(/g, 'const snapshots: any[] = await getRepositories().dashboard.listMaturitySnapshots(');
    content = content.replace(/const efforts = await getRepositories\(\)\.dashboard\.listEffortEstimates\(/g, 'const efforts: any[] = await getRepositories().dashboard.listEffortEstimates(');
    changed = true;
  }
  
  if (file.endsWith("deliveryWorker.ts")) {
    content = content.replace(/nextAttemptAt:\s*\{\s*lte:\s*new Date\(\)\s*\}/g, '');
    content = content.replace(/attempts/g, 'attempt_count');
    content = content.replace(/const attempts = event\.attempt_count \+ 1;/g, 'const attempt_count = event.attempt_count + 1;');
    content = content.replace(/attempts,/g, 'attempt_count,');
    content = content.replace(/nextAttemptAt = /g, '');
    content = content.replace(/let nextAttemptAt/g, '');
    content = content.replace(/nextAttemptAt,/g, '');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
  }
}
