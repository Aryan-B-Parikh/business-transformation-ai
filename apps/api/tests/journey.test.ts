import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  initializeJourney,
  transitionStage,
  rollbackToRevision,
  ConcurrencyError,
  TransitionError,
} from "../src/services/journey";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

describe.skipIf(!process.env.DATABASE_URL)("Phase 8: Persistent Transformation Journey", () => {
  const orgId = uuidv4();
  const actorId = uuidv4();
  let projectId: string;

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: orgId, name: "Journey Org" } });
    await prisma.user.create({ data: { id: actorId, orgId, email: "journey@test.com", name: "J", role: "contributor" } });
    const ws = await prisma.workspace.create({ data: { orgId, name: "WS", createdBy: actorId } });
    const proj = await prisma.project.create({ data: { orgId, workspaceId: ws.id, name: "Proj" } });
    projectId = proj.id;
  });

  beforeEach(async () => {
    await prisma.journeyTransition.deleteMany({});
    await prisma.transformationJourney.deleteMany({});
  });

  it("8.1 Initializes journey correctly", async () => {
    const journey = await initializeJourney(projectId, orgId, actorId);
    expect(journey.currentStage).toBe("idea");
    expect(journey.version).toBe(1);

    const transitions = await prisma.journeyTransition.findMany({ where: { journeyId: journey.id } });
    expect(transitions).toHaveLength(1);
    expect(transitions[0].toStage).toBe("idea");
  });

  it("8.2 Valid transitions succeed, invalid jumps fail", async () => {
    let journey = await initializeJourney(projectId, orgId, actorId);
    
    // Valid: idea -> discovery
    journey = await transitionStage(projectId, orgId, "discovery", actorId, journey.version);
    expect(journey.currentStage).toBe("discovery");
    expect(journey.version).toBe(2);

    // Invalid: discovery -> architecture (skipping business_analysis and solution_design)
    await expect(
      transitionStage(projectId, orgId, "architecture", actorId, journey.version)
    ).rejects.toThrow(TransitionError);
  });

  it("8.3 Optimistic concurrency rejects stale updates", async () => {
    const journey = await initializeJourney(projectId, orgId, actorId);
    
    // Actor 1 transitions
    await transitionStage(projectId, orgId, "discovery", actorId, journey.version);
    
    // Actor 2 tries to transition using the old version
    await expect(
      transitionStage(projectId, orgId, "discovery", actorId, journey.version) // stale version 1
    ).rejects.toThrow(ConcurrencyError);
  });

  it("8.4 Rollback creates new append-only event", async () => {
    let journey = await initializeJourney(projectId, orgId, actorId);
    journey = await transitionStage(projectId, orgId, "discovery", actorId, journey.version);
    journey = await transitionStage(projectId, orgId, "business_analysis", actorId, journey.version);
    
    // Now at version 3, stage business_analysis. Rollback to revision 2 (discovery)
    const rolledBack = await rollbackToRevision(projectId, orgId, 2, actorId);
    expect(rolledBack.currentStage).toBe("discovery");
    expect(rolledBack.version).toBe(4);

    const transitions = await prisma.journeyTransition.findMany({
      where: { journeyId: journey.id },
      orderBy: { revision: "asc" }
    });
    expect(transitions).toHaveLength(4);
    expect(transitions[3].fromStage).toBe("business_analysis");
    expect(transitions[3].toStage).toBe("discovery");
    expect(transitions[3].reason).toContain("Rollback");
  });
});
