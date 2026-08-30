/**
 * Repository Provider & Factory (All 7 Domain Aggregates)
 * Production is PostgreSQL-only. Memory repositories are test-only.
 */

import {
  IProjectAggregateRepository,
  IArtifactAggregateRepository,
  ITransformationAggregateRepository,
  IDocumentAggregateRepository,
  ICollaborationAggregateRepository,
  IWebhookAggregateRepository,
  IGovernanceAggregateRepository,
} from "./interfaces";
import {
  MemoryProjectRepository,
  MemoryArtifactRepository,
  MemoryTransformationRepository,
  MemoryDocumentRepository,
  MemoryCollaborationRepository,
  MemoryWebhookRepository,
  MemoryGovernanceRepository,
} from "./memory";
import {
  PostgresProjectRepository,
  PostgresArtifactRepository,
  PostgresTransformationRepository,
  PostgresDocumentRepository,
  PostgresCollaborationRepository,
  PostgresWebhookRepository,
  PostgresGovernanceRepository,
  PrismaClientType,
} from "./postgres";

export type StorageBackend = "postgres" | "memory";

export interface Repositories {
  projects: IProjectAggregateRepository;
  artifacts: IArtifactAggregateRepository;
  transformation: ITransformationAggregateRepository;
  documents: IDocumentAggregateRepository;
  collaboration: ICollaborationAggregateRepository;
  webhooks: IWebhookAggregateRepository;
  governance: IGovernanceAggregateRepository;
}

let activeRepositories: Repositories | null = null;

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

export function initializeRepositories(
  backend: StorageBackend = (process.env.STORAGE_BACKEND as StorageBackend) || (isTestEnvironment() ? "memory" : "postgres"),
  prisma?: PrismaClientType
): Repositories {
  if (backend !== "postgres" && backend !== "memory") {
    throw new Error(`Unsupported STORAGE_BACKEND: ${String(backend)}`);
  }

  // Memory is deliberately unavailable outside tests. This prevents an accidental
  // production/dev deployment from silently losing persistence.
  if (backend === "memory" && !isTestEnvironment()) {
    throw new Error("CRITICAL SECURITY INVARIANT VIOLATION: STORAGE_BACKEND=memory is test-only.");
  }

  if (backend === "postgres") {
    if (!process.env.DATABASE_URL && !prisma) {
      throw new Error("CRITICAL PERSISTENCE VIOLATION: DATABASE_URL is required for PostgreSQL repositories.");
    }
    if (!prisma) {
      throw new Error("CRITICAL PERSISTENCE VIOLATION: PostgreSQL repositories require an initialized Prisma client.");
    }

    activeRepositories = {
      projects: new PostgresProjectRepository(prisma),
      artifacts: new PostgresArtifactRepository(prisma),
      transformation: new PostgresTransformationRepository(prisma),
      documents: new PostgresDocumentRepository(prisma),
      collaboration: new PostgresCollaborationRepository(prisma),
      webhooks: new PostgresWebhookRepository(prisma),
      governance: new PostgresGovernanceRepository(prisma),
    };
    return activeRepositories;
  }

  activeRepositories = {
    projects: new MemoryProjectRepository(),
    artifacts: new MemoryArtifactRepository(),
    transformation: new MemoryTransformationRepository(),
    documents: new MemoryDocumentRepository(),
    collaboration: new MemoryCollaborationRepository(),
    webhooks: new MemoryWebhookRepository(),
    governance: new MemoryGovernanceRepository(),
  };
  return activeRepositories;
}

export function getRepositories(): Repositories {
  if (!activeRepositories) return initializeRepositories();
  return activeRepositories;
}

export function resetRepositoriesForTests(): void {
  activeRepositories = null;
}

export * from "./interfaces";
export * from "./memory";
export * from "./postgres";
