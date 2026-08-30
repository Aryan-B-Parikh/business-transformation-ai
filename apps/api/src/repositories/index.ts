/**
 * Repository Provider & Factory
 * Enforces production fail-fast rules against accidental memory storage.
 */

import {
  IProjectAggregateRepository,
  IArtifactAggregateRepository,
  ITransformationAggregateRepository,
} from "./interfaces";
import {
  MemoryProjectRepository,
  MemoryArtifactRepository,
  MemoryTransformationRepository,
} from "./memory";
import {
  PostgresProjectRepository,
  PostgresArtifactRepository,
  PostgresTransformationRepository,
  PrismaClientType,
} from "./postgres";

export type StorageBackend = "postgres" | "memory";

export interface Repositories {
  projects: IProjectAggregateRepository;
  artifacts: IArtifactAggregateRepository;
  transformation: ITransformationAggregateRepository;
}

let activeRepositories: Repositories | null = null;

export function initializeRepositories(
  backend: StorageBackend = (process.env.STORAGE_BACKEND as StorageBackend) || "memory",
  prisma?: PrismaClientType
): Repositories {
  // Enforce Non-Negotiable Production Fail-Fast Invariant
  if (process.env.NODE_ENV === "production") {
    if (backend !== "postgres") {
      throw new Error(
        "CRITICAL SECURITY INVARIANT VIOLATION: Production requires STORAGE_BACKEND=postgres. Refusing to start."
      );
    }
    if (!prisma && !process.env.DATABASE_URL) {
      throw new Error(
        "CRITICAL PERSISTENCE VIOLATION: DATABASE_URL is missing in production. Refusing to start."
      );
    }
  }

  if (backend === "postgres" && prisma) {
    activeRepositories = {
      projects: new PostgresProjectRepository(prisma),
      artifacts: new PostgresArtifactRepository(prisma),
      transformation: new PostgresTransformationRepository(prisma),
    };
  } else {
    activeRepositories = {
      projects: new MemoryProjectRepository(),
      artifacts: new MemoryArtifactRepository(),
      transformation: new MemoryTransformationRepository(),
    };
  }

  return activeRepositories;
}

export function getRepositories(): Repositories {
  if (!activeRepositories) {
    return initializeRepositories();
  }
  return activeRepositories;
}

export * from "./interfaces";
export * from "./memory";
export * from "./postgres";
