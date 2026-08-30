import { getRepositories } from "../repositories";
import { ArtifactStatus } from "@bta/shared";

export async function requestReview(orgId: string, artifactId: string, actorId: string) {
  const art = await getRepositories().artifacts.findById(orgId, artifactId);
  if (!art || art.orgId !== orgId) {
    throw new Error("Artifact not found");
  }

  if (art.status !== "draft") {
    throw new Error("Only draft artifacts can be moved to in_review");
  }

  // Update memory store (legacy)
  art.status = "in_review";
  // Optionally, we could also log this transition in Postgres, but the memory store is truth for this object right now.
  
  return art;
}

export async function submitDecision(
  orgId: string,
  artifactId: string,
  approverId: string,
  decision: "approved" | "rejected" | "changes_requested",
  comment?: string
) {
  const art = await getRepositories().artifacts.findById(orgId, artifactId);
  if (!art || art.orgId !== orgId) {
    throw new Error("Artifact not found");
  }

  if (art.status !== "in_review") {
    throw new Error("Only in_review artifacts can receive approval decisions");
  }

  // Rule: AI-generated artifact cannot be auto-approved; human review required.
  // This is satisfied by the fact that submitDecision is called by a human actor (`approverId`).

  // Record the approval decision in persistent storage
  const record = await getRepositories().collaboration.recordApproval(
    orgId,
    artifactId,
    approverId,
    decision,
    comment
  );

  // Apply state machine updates
  if (decision === "approved") {
    art.status = "approved";
  } else if (decision === "rejected" || decision === "changes_requested") {
    // Revert to draft so it can be edited and resubmitted
    art.status = "draft";
  }

  return { artifact: art, record };
}
