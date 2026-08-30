import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, callback);
    } else if (fullPath.endsWith('.ts')) {
      callback(fullPath);
    }
  }
}

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
  'user_id': 'userId',
  'event_type': 'eventType',
  'aggregate_id': 'aggregateId',
  'attempt_count': 'attemptCount',
  'digital_maturity_score': 'digitalMaturityScore',
  'ai_readiness_score': 'aiReadinessScore',
  'automation_opportunity_score': 'automationOpportunityScore',
  'captured_at': 'capturedAt'
};

const dirs = [
  'd:\\Ai Business\\apps\\api\\src\\routes',
  'd:\\Ai Business\\apps\\api\\src\\services',
  'd:\\Ai Business\\apps\\api\\src\\middleware',
  'd:\\Ai Business\\apps\\api\\tests'
];

for (const dir of dirs) {
  walk(dir, (file) => {
    let content = fs.readFileSync(file, 'utf8');
    for (const [snake, camel] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${snake}\\b`, 'g');
      content = content.replace(regex, camel);
    }
    fs.writeFileSync(file, content, 'utf8');
  });
}
console.log('CamelCased codebase.');
