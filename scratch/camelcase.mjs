import fs from 'fs';
import path from 'path';

const files = [
  'd:\\Ai Business\\apps\\api\\src\\repositories\\interfaces.ts',
  'd:\\Ai Business\\apps\\api\\src\\repositories\\memory\\index.ts',
  'd:\\Ai Business\\apps\\api\\src\\repositories\\postgres\\index.ts'
];

const replacements = {
  'org_id': 'orgId',
  'created_at': 'createdAt',
  'updated_at': 'updatedAt',
  'project_id': 'projectId',
  'workspace_id': 'workspaceId',
  'document_id': 'documentId',
  'artifact_id': 'artifactId',
  'parent_artifact_id': 'parentArtifactId',
  'generated_by': 'generatedBy',
  'created_by': 'createdBy',
  'parsed_status': 'parsedStatus',
  'storage_url': 'storageUrl',
  'uploaded_by': 'uploadedBy',
  'chunk_text': 'chunkText',
  'page_ref': 'pageRef',
  'started_by': 'startedBy',
  'conversation_id': 'conversationId',
  'author_id': 'authorId',
  'parent_comment_id': 'parentCommentId',
  'approver_id': 'approverId',
  'target_type': 'targetType',
  'target_id': 'targetId',
  'actor_id': 'actorId',
  'model_name': 'modelName',
  'user_id': 'userId'
};

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // We only replace property accesses and object keys, not strings in SQL or where clauses that use Prisma?
  // Actually, Prisma where clauses DO use camelCase for mapped fields! So `{ org_id: orgId }` in Prisma is WRONG. It should be `{ orgId: orgId }`!
  // Wow, my PostgresProjectRepository was completely broken for Prisma calls because I was passing snake_case keys!
  // Prisma generates the client with the model field name (orgId), not the mapped name (org_id).
  
  for (const [snake, camel] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${snake}\\b`, 'g');
    content = content.replace(regex, camel);
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log(`CamelCased ${file}`);
}
