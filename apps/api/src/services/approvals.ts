import { getRepositories } from "../repositories";

export async function requestReview(orgId: string, artifactId: string, actorId: string) {
  const repo = getRepositories().artifacts;
  const art = await repo.findById(orgId, artifactId);
  if (!art) throw new Error("Artifact not found");
  if (art.status !== "draft") throw new Error("Only draft artifacts can be moved to in_review");

  const updated = await repo.updateStatus(orgId, artifactId, "in_review");
  await getRepositories().governance.recordAuditLog(
    orgId,
    actorId,
    "artifact.review_requested",
    "artifact",
    artifactId,
    { from: "draft", to: "in_review", version: updated.version },
  );
  return updated;
}

export async function submitDecision(
  orgId: string,
  artifactId: string,
  approverId: string,
  decision: "approved" | "rejected" | "changes_requested",
  comment?: string,
) {
  const artifacts = getRepositories().artifacts;
  const collaboration = getRepositories().collaboration;
  const governance = getRepositories().governance;
  const art = await artifacts.findById(orgId, artifactId);
  if (!art) throw new Error("Artifact not found");
  if (art.status !== "in_review") throw new Error("Only in_review artifacts can receive approval decisions");

  const record = await collaboration.recordApproval(orgId, artifactId, approverId, decision, comment);
  const nextStatus = decision === "approved" ? "approved" : "draft";
  const updated = await artifacts.updateStatus(orgId, artifactId, nextStatus);

  await governance.recordAuditLog(
    orgId,
    approverId,
    `artifact.approval.${decision}`,
    "artifact",
    artifactId,
    { decision, comment: comment ?? null, version: updated.version },
  );

  return { artifact: updated, record };
}
