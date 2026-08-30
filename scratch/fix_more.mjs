import fs from 'fs';

function removeDuplicateImports(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  const uniqueLines = [];
  const imports = new Set();
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('import { getRepositories }')) {
      if (imports.has(line)) {
        changed = true;
        continue;
      }
      imports.add(line);
    }
    uniqueLines.push(line);
  }

  if (changed) {
    fs.writeFileSync(filepath, uniqueLines.join('\n'), 'utf8');
  }
}

removeDuplicateImports('d:/Ai Business/apps/api/src/services/approvals.ts');
removeDuplicateImports('d:/Ai Business/apps/api/src/services/collaboration.ts');

let baContent = fs.readFileSync('d:/Ai Business/apps/api/src/services/businessAnalysis.ts', 'utf8');
if (baContent.includes('z.record(z.number())')) {
  baContent = baContent.replace('z.record(z.number())', 'z.record(z.string(), z.number())');
  fs.writeFileSync('d:/Ai Business/apps/api/src/services/businessAnalysis.ts', baContent, 'utf8');
}
