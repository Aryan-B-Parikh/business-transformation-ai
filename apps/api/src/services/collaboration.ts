import { getRepositories } from "../repositories";

export async function addComment(orgId: string, artifactId: string, authorId: string, content: string) {
  const artifacts = getRepositories().artifacts;
  const art = await artifacts.findById(orgId, artifactId);
  if (!art) throw new Error("Artifact not found");

  const comment = await artifacts.addComment(orgId, artifactId, authorId, content.trim());
  const mentions = [...new Set((content.match(/@([a-zA-Z0-9_-]+)/g) ?? []).map((m) => m.slice(1)))];
  for (const userId of mentions) {
    if (userId === authorId) continue;
    await getRepositories().collaboration.createNotification(
      orgId,
      userId,
      "You were mentioned",
      `You were mentioned in a comment on artifact ${artifactId}`,
    );
  }
  await getRepositories().governance.recordAuditLog(orgId, authorId, "artifact.comment_created", "artifact", artifactId, { commentId: comment.id, mentions });
  return comment;
}

export async function getComments(orgId: string, artifactId: string) {
  const art = await getRepositories().artifacts.findById(orgId, artifactId);
  if (!art) throw new Error("Artifact not found");
  return getRepositories().artifacts.listComments(orgId, artifactId);
}
