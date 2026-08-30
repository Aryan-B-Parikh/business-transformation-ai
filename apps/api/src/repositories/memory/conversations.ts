import crypto from "crypto";
import { IConversationAggregateRepository, ConversationEntity, ConversationMessageEntity } from "../interfaces";
export class MemoryConversationAggregateRepository implements IConversationAggregateRepository {
 private conversations=new Map<string,ConversationEntity>(); private messages=new Map<string,ConversationMessageEntity[]>();
 async create(orgId:string,projectId:string,startedBy:string){const c={id:crypto.randomUUID(),orgId,projectId,startedBy,createdAt:new Date()};this.conversations.set(c.id,c);this.messages.set(c.id,[]);return c;}
 async findById(orgId:string,id:string){const c=this.conversations.get(id);return c&&c.orgId===orgId?c:null;}
 async listByProject(orgId:string,projectId:string){return [...this.conversations.values()].filter(c=>c.orgId===orgId&&c.projectId===projectId);}
 async addMessage(orgId:string,conversationId:string,role:"user"|"ai",content:string){const c=await this.findById(orgId,conversationId);if(!c)throw new Error("Conversation not found");const m={id:crypto.randomUUID(),orgId,conversationId,role,content,createdAt:new Date()};this.messages.get(conversationId)!.push(m);return m;}
 async listMessages(orgId:string,conversationId:string){const c=await this.findById(orgId,conversationId);if(!c)throw new Error("Conversation not found");return [...(this.messages.get(conversationId)||[])];}
}
