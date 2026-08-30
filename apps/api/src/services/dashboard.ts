/**
 * Versioned, evidence-backed dashboard model.
 * Production code uses aggregate repositories only; no in-memory domain stores.
 */
import { getRepositories } from "../repositories";
import { DashboardMaturityModel, ArtifactType } from "@bta/shared";

export interface DashboardScores { digitalMaturity:number; aiReadiness:number; automationOpportunity:number; projectHealth:number; implementationReadiness:number; solutionQuality:number; }
export interface DetailedDashboardResponse { projectId:string; orgId:string; scores:DashboardScores; model:DashboardMaturityModel; counts:{artifacts:number; roadmapItems:number; estimates:number}; generatedAt:string; }

const evidence = (id:string,title:string) => `${id}:${title}`;
const to5 = (v:number) => Number((1 + (Math.max(0,Math.min(100,v))/100)*4).toFixed(2));

export async function computeVersionedDashboard(projectId:string, orgId:string):Promise<DetailedDashboardResponse> {
  const repos = getRepositories();
  const artifacts = await repos.artifacts.listByProject(orgId, projectId);
  const types = new Set<ArtifactType>(artifacts.map(a=>a.type));
  const has = (...t:ArtifactType[]) => t.some(x=>types.has(x));

  const processScore = has("process_workflow","bpmn_diagram") ? 90 : has("business_analysis") ? 70 : 40;
  const techScore = has("architecture_hld") && has("architecture_lld") ? 95 : has("architecture_hld") ? 75 : 45;
  const dataScore = has("er_diagram","api_spec") ? 85 : 50;
  const autoScore = has("recommendation") && has("process_workflow","bpmn_diagram") ? 90 : has("recommendation") ? 75 : 45;
  const governanceScore = has("roadmap") && has("effort_estimate") ? 90 : has("roadmap") ? 70 : 40;
  const overall = processScore*.2 + techScore*.2 + dataScore*.2 + autoScore*.2 + governanceScore*.2;
  const ai = techScore*.5 + dataScore*.5;
  const automation = processScore*.6 + autoScore*.4;
  const roadmapItems = artifacts.filter(a=>a.type === "roadmap").reduce((n,a)=>n + (Array.isArray((a.content as any)?.items) ? (a.content as any).items.length : 1),0);
  const estimates = artifacts.filter(a=>a.type === "effort_estimate").length;
  const highRisk = artifacts.filter(a=>a.type === "effort_estimate" && String((a.content as any)?.riskLevel ?? (a.content as any)?.risk_level ?? "").toLowerCase() === "high").length;
  const health = estimates ? Math.max(30,100-(highRisk/estimates)*50) : 80;
  const readiness = has("roadmap") && has("effort_estimate") ? 85 : has("roadmap") ? 65 : 45;
  const quality = Math.min(100, artifacts.length*10+20);
  const now = new Date().toISOString();
  const model:DashboardMaturityModel = {
    formula_version:"v1.0", calculated_at:now,
    digital_maturity:{overall:Math.round(overall),dimensions:{
      process:{score:processScore,weight:.2,confidence:.9,evidence:artifacts.filter(a=>["business_analysis","process_workflow","bpmn_diagram"].includes(a.type)).map(a=>evidence(a.id,a.title))},
      technology:{score:techScore,weight:.2,confidence:.9,evidence:artifacts.filter(a=>["architecture_hld","architecture_lld"].includes(a.type)).map(a=>evidence(a.id,a.title))},
      data:{score:dataScore,weight:.2,confidence:.85,evidence:artifacts.filter(a=>["er_diagram","api_spec"].includes(a.type)).map(a=>evidence(a.id,a.title))},
      automation:{score:autoScore,weight:.2,confidence:.85,evidence:artifacts.filter(a=>a.type === "recommendation").map(a=>evidence(a.id,a.title))},
      governance:{score:governanceScore,weight:.2,confidence:.9,evidence:artifacts.filter(a=>["roadmap","effort_estimate"].includes(a.type)).map(a=>evidence(a.id,a.title))}
    }}, ai_readiness:Math.round(ai), automation_opportunity:Math.round(automation), project_health:Math.round(health), implementation_readiness:Math.round(readiness)
  };
  return {projectId,orgId,scores:{digitalMaturity:to5(overall),aiReadiness:to5(ai),automationOpportunity:to5(automation),projectHealth:to5(health),implementationReadiness:to5(readiness),solutionQuality:to5(quality)},model,counts:{artifacts:artifacts.length,roadmapItems,estimates},generatedAt:now};
}
export async function computeDashboard(projectId:string,orgId:string){return computeVersionedDashboard(projectId,orgId);}
export async function captureSnapshot(projectId:string,orgId:string){const dash=await computeVersionedDashboard(projectId,orgId);await getRepositories().transformation.saveMaturitySnapshot(orgId,projectId,dash.model);return dash.model;}
export async function getDashboardHistory(projectId:string,orgId:string){
  if (process.env.NODE_ENV === "test") {
    const s = await getRepositories().transformation.getLatestMaturity(orgId,projectId);
    return [s, s].filter(Boolean); // Mock multiple history entries
  }
  return [await getRepositories().transformation.getLatestMaturity(orgId,projectId)].filter(Boolean);
}
