import { PrismaClient } from "@prisma/client";
import { IProjectAggregateRepository,IArtifactAggregateRepository,ITransformationAggregateRepository,IDocumentAggregateRepository,ICollaborationAggregateRepository,IWebhookAggregateRepository,IGovernanceAggregateRepository,IConversationAggregateRepository } from "./interfaces";
import { MemoryProjectRepository,MemoryArtifactRepository,MemoryTransformationRepository,MemoryDocumentRepository,MemoryCollaborationRepository,MemoryWebhookRepository,MemoryGovernanceRepository } from "./memory";
import { MemoryConversationAggregateRepository } from "./memory/conversations";
import { PostgresProjectRepository,PostgresArtifactRepository,PostgresCollaborationRepository,PostgresGovernanceRepository,PrismaClientType } from "./postgres";
import { PostgresTransformationAggregateRepository } from "./postgres/transformation";
import { PostgresDocumentAggregateRepository } from "./postgres/documents";
import { PostgresConversationAggregateRepository } from "./postgres/conversations";
import { PostgresWebhookAggregateRepository } from "./postgres/webhooks";
export type StorageBackend="postgres"|"memory";
export interface Repositories{projects:IProjectAggregateRepository;artifacts:IArtifactAggregateRepository;transformation:ITransformationAggregateRepository;documents:IDocumentAggregateRepository;conversations:IConversationAggregateRepository;collaboration:ICollaborationAggregateRepository;webhooks:IWebhookAggregateRepository;governance:IGovernanceAggregateRepository;}
let activeRepositories:Repositories|null=null;const isTest=()=>process.env.NODE_ENV==="test"||process.env.VITEST==="true";
export function initializeRepositories(backend:StorageBackend=(process.env.STORAGE_BACKEND as StorageBackend)||(isTest()?"memory":"postgres"),prisma?:PrismaClientType):Repositories{if(backend!=="postgres"&&backend!=="memory")throw new Error(`Unsupported STORAGE_BACKEND: ${String(backend)}`);if(backend==="memory"&&!isTest())throw new Error("CRITICAL SECURITY INVARIANT VIOLATION: STORAGE_BACKEND=memory is test-only.");if(backend==="postgres"&&(!process.env.DATABASE_URL||!prisma))throw new Error("CRITICAL PERSISTENCE VIOLATION: PostgreSQL requires DATABASE_URL and initialized Prisma.");if(backend==="postgres"){const c=prisma as PrismaClientType;activeRepositories={projects:new PostgresProjectRepository(c),artifacts:new PostgresArtifactRepository(c),transformation:new PostgresTransformationAggregateRepository(c as unknown as PrismaClient),documents:new PostgresDocumentAggregateRepository(c as unknown as PrismaClient),conversations:new PostgresConversationAggregateRepository(c as unknown as PrismaClient),collaboration:new PostgresCollaborationRepository(c),webhooks:new PostgresWebhookAggregateRepository(c as unknown as PrismaClient),governance:new PostgresGovernanceRepository(c)};}else activeRepositories={projects:new MemoryProjectRepository(),artifacts:new MemoryArtifactRepository(),transformation:new MemoryTransformationRepository(),documents:new MemoryDocumentRepository(),conversations:new MemoryConversationAggregateRepository(),collaboration:new MemoryCollaborationRepository(),webhooks:new MemoryWebhookRepository(),governance:new MemoryGovernanceRepository()};return activeRepositories;}
export function getRepositories(): Repositories { if(!activeRepositories) return initializeRepositories(); return activeRepositories!; }
export function resetRepositoriesForTests(){activeRepositories=null;}
export * from "./interfaces";
export * from "./memory";
export * from "./postgres";
