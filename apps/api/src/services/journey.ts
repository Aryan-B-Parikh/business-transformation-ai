import { PrismaClient, JourneyStage } from "@prisma/client";

const prisma = new PrismaClient();

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

const STAGE_ORDER: JourneyStage[] = [
  "idea",
  "discovery",
  "business_analysis",
  "solution_design",
  "architecture",
  "process_design",
  "ux_design",
  "data_design",
  "planning",
  "review",
  "approved",
  "implementation",
];

export async function initializeJourney(projectId: string, orgId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    // Check if journey already exists
    const existing = await tx.transformationJourney.findUnique({
      where: { projectId },
    });
    if (existing) return existing;

    const journey = await tx.transformationJourney.create({
      data: {
        projectId,
        orgId,
        currentStage: "idea",
        actor: actorId,
        version: 1,
      },
    });

    await tx.journeyTransition.create({
      data: {
        journeyId: journey.id,
        orgId,
        fromStage: null,
        toStage: "idea",
        actor: actorId,
        reason: "Journey initialized",
        revision: 1,
      },
    });

    return journey;
  });
}

export async function transitionStage(
  projectId: string,
  orgId: string,
  toStage: JourneyStage,
  actorId: string,
  currentVersion: number,
  reason?: string
) {
  return prisma.$transaction(async (tx) => {
    const journey = await tx.transformationJourney.findUnique({
      where: { projectId },
    });

    if (!journey) throw new Error("Journey not found");
    if (journey.orgId !== orgId) throw new Error("Tenant isolation violation");
    if (journey.version !== currentVersion) {
      throw new ConcurrencyError(`Optimistic concurrency failed. Expected version ${currentVersion}, got ${journey.version}`);
    }

    const currentIndex = STAGE_ORDER.indexOf(journey.currentStage);
    const targetIndex = STAGE_ORDER.indexOf(toStage);

    if (targetIndex === currentIndex) {
      throw new TransitionError("Already at this stage");
    }

    // Usually transitions should only go forward one step, but for flexibility we might allow jumping back,
    // or jumping forward if approved. For strictness, let's just enforce that it's a valid stage.
    // If they skip multiple steps forward, we could reject. Let's enforce sequential forward moves.
    if (targetIndex > currentIndex + 1) {
      throw new TransitionError(`Invalid transition: Cannot jump from ${journey.currentStage} to ${toStage}`);
    }

    const updated = await tx.transformationJourney.update({
      where: { id: journey.id, version: currentVersion },
      data: {
        currentStage: toStage,
        version: currentVersion + 1,
        actor: actorId,
        enteredAt: new Date(),
      },
    });

    await tx.journeyTransition.create({
      data: {
        journeyId: journey.id,
        orgId,
        fromStage: journey.currentStage,
        toStage,
        actor: actorId,
        reason,
        revision: currentVersion + 1,
      },
    });

    return updated;
  });
}

export async function rollbackToRevision(
  projectId: string,
  orgId: string,
  revisionId: number,
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    const journey = await tx.transformationJourney.findUnique({
      where: { projectId },
      include: { transitions: { orderBy: { revision: "asc" } } },
    });

    if (!journey) throw new Error("Journey not found");
    if (journey.orgId !== orgId) throw new Error("Tenant isolation violation");

    const targetTransition = journey.transitions.find((t) => t.revision === revisionId);
    if (!targetTransition) throw new Error("Revision not found");

    const updated = await tx.transformationJourney.update({
      where: { id: journey.id },
      data: {
        currentStage: targetTransition.toStage,
        version: journey.version + 1,
        actor: actorId,
        enteredAt: new Date(),
      },
    });

    await tx.journeyTransition.create({
      data: {
        journeyId: journey.id,
        orgId,
        fromStage: journey.currentStage,
        toStage: targetTransition.toStage,
        actor: actorId,
        reason: `Rollback to revision ${revisionId}`,
        revision: journey.version + 1,
      },
    });

    return updated;
  });
}
