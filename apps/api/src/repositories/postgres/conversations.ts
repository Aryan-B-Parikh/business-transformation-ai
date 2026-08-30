import { PrismaClient } from "@prisma/client";
import { IConversationAggregateRepository, ConversationEntity, ConversationMessageEntity } from "../interfaces";
import { withTenant, assertTenant } from "../../db/tenant";

export class PostgresConversationAggregateRepository implements IConversationAggregateRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async create(orgId:string,projectId:string,startedBy:string):Promise<ConversationEntity>{
    assertTenant(orgId); return withTenant(this.prisma as never,orgId,async(tx:unknown)=>{
      const c=await (tx as any).conversation.create({data:{orgId,projectId,startedBy}}); return c;
    });
  }
  async findById(orgId:string,id:string):Promise<ConversationEntity|null>{
    assertTenant(orgId); return withTenant(this.prisma as never,orgId,async(tx:unknown)=> (tx as any).conversation.findFirst({where:{id,orgId}}));
  }
  async listByProject(orgId:string,projectId:string):Promise<ConversationEntity[]>{
    assertTenant(orgId); return withTenant(this.prisma as never,orgId,async(tx:unknown)=> (tx as any).conversation.findMany({where:{projectId,orgId},orderBy:{createdAt:"asc"}}));
  }
  async addMessage(orgId:string,conversationId:string,role:"user"|"ai",content:string):Promise<ConversationMessageEntity>{
    assertTenant(orgId); return withTenant(this.prisma as never,orgId,async(tx:unknown)=>{
      const p=tx as any; const c=await p.conversation.findFirst({where:{id:conversationId,orgId}}); if(!c) throw new Error("Conversation not found");
      return p.conversationMessage.create({data:{conversationId,orgId,role,content}});
    });
  }
  async listMessages(orgId:string,conversationId:string):Promise<ConversationMessageEntity[]>{
    assertTenant(orgId); return withTenant(this.prisma as never,orgId,async(tx:unknown)=>{
      const p=tx as any; const c=await p.conversation.findFirst({where:{id:conversationId,orgId}}); if(!c) throw new Error("Conversation not found");
      return p.conversationMessage.findMany({where:{conversationId,orgId},orderBy:{createdAt:"asc"}});
    });
  }
}
