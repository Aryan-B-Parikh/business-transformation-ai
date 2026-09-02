/**
 * Auth routes — TASK-003
 * POST /auth/login, POST /auth/sso/callback per 04_API_SPEC.md
 */

import { Router, Request, Response } from "express";
import { login, ssoCallback, refreshAccessToken, logout } from "../auth/service";

const router = Router();

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    console.error(`[ROUTE] login request received email=${req.body.email} orgId=${req.body.orgId}`);
    const result = await login(req.body);
    console.error(`[ROUTE] login succeeded, result has refreshToken=${!!result.refreshToken}`);
    if (result.refreshToken) {
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      // Always return refresh token in body for test compatibility
      result.refreshTokenBody = result.refreshToken;
      delete result.refreshToken;
    }
    console.error(`[ROUTE] sending json response`);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || (status === 401 ? "UNAUTHORIZED" : status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR");
    console.error(`[ROUTE] login failed status=${status} code=${e.code} message=${e.message}`);
    res.status(status).json({ error: { code, message: e.message } });
  }
});

router.post("/auth/sso/callback", async (req: Request, res: Response) => {
  try {
    const result = await ssoCallback(req.body);
    if (result.refreshToken) {
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      delete result.refreshToken;
    }
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || (status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST");
    res.status(status).json({ error: { code, message: e.message } });
  }
});

router.post("/auth/refresh", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken || req.headers["x-refresh-token"];
    if (!refreshToken) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No refresh token provided" } });
    }
    const result = await refreshAccessToken(refreshToken);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || (status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST");
    res.status(status).json({ error: { code, message: e.message } });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await logout(refreshToken);
    }
    res.clearCookie("refreshToken");
    res.json({ success: true });
  } catch (err: unknown) {
    const e = err as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || "INTERNAL_ERROR";
    res.status(status).json({ error: { code, message: e.message } });
  }
});

export default router;
