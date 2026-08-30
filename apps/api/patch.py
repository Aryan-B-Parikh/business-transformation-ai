import os, re, glob

test_dir = 'tests'
files = glob.glob(os.path.join(test_dir, '*.test.ts'))

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if 'src/stores/' not in content:
        continue
        
    # Replace imports
    content = re.sub(r'import\s+\{[^}]+\}\s+from\s+[\'"]\.\./src/stores/[^\'"]+[\'"];\n?', '', content)
    
    if 'getRepositories' not in content:
        content = 'import { getRepositories, resetRepositoriesForTests } from "../src/repositories";\n' + content

    # Replace clears
    content = re.sub(r'clear[A-Z][a-zA-Z0-9_]*\(\);?', 'resetRepositoriesForTests();', content)
    content = re.sub(r'(resetRepositoriesForTests\(\);\s*){2,}', 'resetRepositoriesForTests();\n    ', content)
    
    # Replace createDocument
    def repl_doc(m):
        args = m.group(1)
        org = re.search(r'orgId:\s*([^,]+)', args)
        proj = re.search(r'projectId:\s*([^,]+)', args)
        fname = re.search(r'filename:\s*([^,]+)', args)
        dtype = re.search(r'type:\s*([^,]+)', args)
        surl = re.search(r'storageUrl:\s*([^,]+)', args)
        
        org_val = org.group(1).strip() if org else '""'
        proj_val = proj.group(1).strip() if proj else '""'
        fname_val = fname.group(1).strip() if fname else '""'
        dtype_val = dtype.group(1).strip() if dtype else '"pdf"'
        surl_val = surl.group(1).strip() if surl else '""'
        
        return f'await getRepositories().documents.createDocument({org_val}, {proj_val}, {{ filename: {fname_val}, docType: {dtype_val}, fileSize: 100, storageKey: {surl_val} }})'
    
    content = re.sub(r'createDocument\(\{([^}]+)\}\)', repl_doc, content)
    
    # Replace getDocIdsForProject(proj) -> new Set((await getRepositories().documents.listDocumentsByProject("00000000-0000-0000-0000-0000000000aa", proj)).map((d: any) => d.id))
    # We will hardcode orgA or just use orgA if it exists in scope, or fallback to the first one we find.
    # Actually most tests have `orgA` in scope.
    content = re.sub(r'getDocIdsForProject\(([^)]+)\)', r'new Set((await getRepositories().documents.listDocumentsByProject(orgA, \1)).map((d: any) => d.id))', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
print('Done basic patching.')
