import os, re, glob

test_dir = 'tests'
files = glob.glob(os.path.join(test_dir, '*.test.ts'))

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # getArtifact(id)
    content = re.sub(r'(?<!\.)getArtifact\(([^)]+)\)', r'(await getRepositories().artifacts.findById("00000000-0000-0000-0000-0000000000aa", \1))', content)
    
    # listAuditLogs(org)
    content = re.sub(r'(?<!\.)listAuditLogs\(([^)]+)\)', r'(await getRepositories().governance.listAuditLogs(\1))', content)
    
    # listNotifications(userId) -> listNotifications(org, userId)
    content = re.sub(r'(?<!\.)listNotifications\(([^)]+)\)', r'(await getRepositories().collaboration.listNotifications("00000000-0000-0000-0000-0000000000aa", \1))', content)
    
    # listRoadmapItems
    content = re.sub(r'(?<!\.)listRoadmapItems\(([^,]+),\s*([^)]+)\)', r'(((await getRepositories().artifacts.findById(\2, \1))?.content as any)?.items || [])', content)
    
    # listEffortEstimates
    content = re.sub(r'(?<!\.)listEffortEstimates\(([^,]+),\s*([^)]+)\)', r'(((await getRepositories().artifacts.findById(\2, \1))?.content as any)?.items || [])', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print('Done patch 2.')
