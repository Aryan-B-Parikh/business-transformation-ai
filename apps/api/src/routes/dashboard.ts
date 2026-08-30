/** Dashboard routes — repository-backed and tenant scoped. */
import { Router, Response } from "express";
import { getRepositories } from "../repositories";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { computeDashboard, captureSnapshot, getDashboardHistory } from "../services/dashboard";
const router = Router();

router.get("/projects/:id/dashboard", authenticate, authorize("org_admin","workspace_admin","contributor","reviewer","viewer"), async (req:AuthedRequest,res:Response)=>{
  const orgId=req.user!.orgId, projectId=String(req.params.id);
  const project=await getRepositories().projects.findProjectById(orgId,projectId);
  if(!project){res.status(404).json({error:{code:"NOT_FOUND",message:"Project not found"}});return;}
  const dashboard=await computeDashboard(projectId,orgId);
  const snapshot=await captureSnapshot(projectId,orgId);
  res.json({...dashboard,snapshot});
});

router.get("/projects/:id/dashboard/history", authenticate, authorize("org_admin","workspace_admin","contributor","reviewer","viewer"), async (req:AuthedRequest,res:Response)=>{
  const orgId=req.user!.orgId, projectId=String(req.params.id);
  const project=await getRepositories().projects.findProjectById(orgId,projectId);
  if(!project){res.status(404).json({error:{code:"NOT_FOUND",message:"Project not found"}});return;}
  const history=await getDashboardHistory(projectId,orgId);
  res.json({data:history,total:Array.isArray(history)?history.length:(history?1:0)});
});
export default router;
