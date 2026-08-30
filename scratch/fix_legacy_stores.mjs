import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../apps/api/src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const importRegex = /import\s+\{([^}]+)\}\s+from\s+["'](\.\.\/)*stores\/([^"']+)["'];?/g;

walkDir(rootDir, (filePath) => {
  if (!filePath.endsWith('.ts')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  content = content.replace(importRegex, (match, imports, prefix, storeName) => {
    modified = true;
    const funcs = imports.split(',').map(s => s.trim()).filter(Boolean);
    
    // We will just replace it with Prisma client directly for now to fix the build, 
    // OR we inject a proxy object that implements the old store API using Prisma.
    // Actually, let's inject a local require to a new shim we'll create: `import { ... } from "../legacy_shim"`
    
    // Determine relative path to src/
    const rel = path.relative(path.dirname(filePath), path.join(rootDir, 'legacy_shim.ts'));
    let importPath = rel.replace(/\\/g, '/');
    if (!importPath.startsWith('.')) importPath = './' + importPath;
    if (importPath.endsWith('.ts')) importPath = importPath.slice(0, -3);

    return `import { ${funcs.join(', ')} } from "${importPath}";`;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${filePath}`);
  }
});
