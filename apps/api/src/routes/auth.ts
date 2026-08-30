/**
 * Auth routes — TASK-003
 * POST /auth/login, POST /auth/sso/callback per 04_API_SPEC.md
 */

import { Router, Request, Response } from "express";
import { login, ssoCallback } from "../auth/service";

const router = Router();

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const result = await login(req.body);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || (status === 401 ? "UNAUTHORIZED" : status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR");
    res.status(status).json({ error: { code, message: e.message } });
  }
});

router.post("/auth/sso/callback", async (req: Request, res: Response) => {
  try {
    const result = await ssoCallback(req.body);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || (status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST");
    res.status(status).json({ error: { code, message: e.message } });
  }
});

export default router;
