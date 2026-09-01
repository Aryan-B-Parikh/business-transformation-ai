import { Router, Response } from "express";
import { z } from "zod";
import { getRepositories } from "../repositories";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();
const stages = ["idea","discovery","business_analysis","solution_design","architecture","process_design","ux_design","data_design","planning","review","approved","implementation"] as const;
const transitionSchema = z.object({ stage: z.enum(stages), status: z.enum(["pending","in_progress","completed","blocked"]), version: z.number().int().positive().optional(), reason: z.string().max(2000).optional() }).refine(data => data.stage === "idea" || data.version !== undefined, { message: "version is required for all transitions except initialization at idea", path: ["version"] });
const rollbackSchema = z.object({ stage: z.enum(stages), version: z.number().int().positive(), reason: z.string().min(1).max(2000) });

router.get("/projects/:id/journey", authenticate, authorize("org_admin","workspace_admin","contributor","reviewer","viewer"), async (req: AuthedRequest,res:Response) => {
  const orgId=req.user!.orgId, projectId=String(req.params.id);
  if(!(await getRepositories().projects.findProjectById(orgId,projectId))) return res.status(404).json({error:{code:"NOT_FOUND",message:"Project not found"}});
  return res.json(await getRepositories().transformation.getJourneyState(orgId,projectId));
});

router.post("/projects/:id/journey/transition", authenticate, authorize("org_admin","workspace_admin","contributor"), async (req:AuthedRequest,res:Response) => {
  const parsed=transitionSchema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid journey transition",details:parsed.error.flatten()}});
  const orgId=req.user!.orgId, projectId=String(req.params.id);
  if(!(await getRepositories().projects.findProjectById(orgId,projectId))) return res.status(404).json({error:{code:"NOT_FOUND",message:"Project not found"}});
  try {
    const result=await getRepositories().transformation.transitionStage(orgId,projectId,parsed.data.stage,parsed.data.status,req.user!.userId,parsed.data.reason,parsed.data.version);
    await getRepositories().governance.recordAuditLog(orgId,req.user!.userId,"journey.stage_transition","project",projectId,{stage:parsed.data.stage,status:parsed.data.status,version:result.stage_version,reason:parsed.data.reason??null});
    return res.json(result);
  } catch(error) { const message=error instanceof Error?error.message:"Journey transition failed"; const status=/invalid|concurrency|version|expected|concurrent/i.test(message)?409:500; return res.status(status).json({error:{code:status===409?"CONFLICT":"INTERNAL_ERROR",message}}); }
});

router.post("/projects/:id/journey/rollback", authenticate, authorize("org_admin","workspace_admin"), async (req:AuthedRequest,res:Response) => {
  const parsed=rollbackSchema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid rollback request",details:parsed.error.flatten()}});
  const orgId=req.user!.orgId, projectId=String(req.params.id);
  if(!(await getRepositories().projects.findProjectById(orgId,projectId))) return res.status(404).json({error:{code:"NOT_FOUND",message:"Project not found"}});
  try {
    const rollback=getRepositories().transformation.rollbackStage;
    if(!rollback) return res.status(501).json({error:{code:"NOT_IMPLEMENTED",message:"Journey rollback is unavailable"}});
    const result=await rollback.call(getRepositories().transformation,orgId,projectId,parsed.data.stage,req.user!.userId,parsed.data.reason,parsed.data.version);
    await getRepositories().governance.recordAuditLog(orgId,req.user!.userId,"journey.rollback","project",projectId,{targetStage:parsed.data.stage,version:result.stage_version,reason:parsed.data.reason});
    return res.json(result);
  } catch(error) { const message=error instanceof Error?error.message:"Journey rollback failed"; const status=/not found|earlier|concurrency|version/i.test(message)?409:500; return res.status(status).json({error:{code:status===409?"CONFLICT":"INTERNAL_ERROR",message}}); }
});
export default router;
