import { getRepositories } from "../repositories";

export async function addComment(
  orgId: string,
  artifactId: string,
  authorId: string,
  content: string
) {
  const art = await getRepositories().artifacts.findById(orgId, artifactId);
  if (!art || art.orgId !== orgId) {
    throw new Error("Artifact not found");
  }

  // Record comment in repository
  const comment = await getRepositories().artifacts.addComment(
    orgId,
    artifactId,
    authorId,
    content
  );

  // Parse mentions (e.g., @user123) and create notifications
  const mentions = content.match(/@([a-zA-Z0-9_-]+)/g);
  if (mentions) {
    // In a real system, we'd map usernames to userIds. Here we assume the mention IS the userId or we just generate a notification for the string.
    for (const mention of mentions) {
      const username = mention.slice(1);
      // Create a notification for the mentioned user
      // For demo purposes we just pass the username as the userId since we don't have a user lookup service here
      await getRepositories().collaboration.createNotification(
        orgId,
        username,
        "You were mentioned",
        `You were mentioned in a comment on artifact ${artifactId}`
      );
    }
  }

  return comment;
}

export async function getComments(orgId: string, artifactId: string) {
  const art = await getRepositories().artifacts.findById(orgId, artifactId);
  if (!art || art.orgId !== orgId) {
    throw new Error("Artifact not found");
  }
  return getRepositories().artifacts.listComments(orgId, artifactId);
}
