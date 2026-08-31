import { getRepositories } from "../repositories";
import { JourneyStage, JourneyStatus } from "@bta/shared";

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrencyError";
  }
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export async function initializeJourney(projectId: string, orgId: string, actorId: string) {
  const repo = getRepositories().transformation;
  try {
    const stage = await repo.transitionStage(orgId, projectId, "idea", "in_progress", actorId);
    return {
      id: stage.id,
      projectId,
      orgId,
      currentStage: stage.stage,
      status: stage.status,
      version: stage.stage_version,
    };
  } catch (err: any) {
    if (err.message?.includes("concurrency") || err.message?.includes("version")) {
      throw new ConcurrencyError(err.message);
    }
    throw new TransitionError(err.message);
  }
}

export async function transitionStage(projectId: string, orgId: string, stage: JourneyStage, actorId: string, expectedVersion?: number) {
  const repo = getRepositories().transformation;
  try {
    const res = await repo.transitionStage(orgId, projectId, stage, "in_progress", actorId, undefined, expectedVersion);
    return {
      id: res.id,
      projectId,
      orgId,
      currentStage: res.stage,
      status: res.status,
      version: res.stage_version,
    };
  } catch (err: any) {
    if (err.message?.includes("concurrency") || err.message?.includes("version") || err.message?.includes("mismatch")) {
      throw new ConcurrencyError(err.message);
    }
    throw new TransitionError(err.message);
  }
}

export async function rollbackToRevision(projectId: string, orgId: string, targetRevision: number, actorId: string) {
  const repo = getRepositories().transformation;
  const stages = await repo.getJourneyState(orgId, projectId);
  const targetStageEntity = stages.find(s => s.stage_version === targetRevision);
  if (!targetStageEntity) throw new Error("Target revision not found");
  if (!repo.rollbackStage) throw new Error("Rollback not supported");
  const res = await repo.rollbackStage(orgId, projectId, targetStageEntity.stage, actorId, `Rollback to revision ${targetRevision}`);
  return {
    id: res.id,
    projectId,
    orgId,
    currentStage: res.stage,
    status: res.status,
    version: res.stage_version,
  };
}
