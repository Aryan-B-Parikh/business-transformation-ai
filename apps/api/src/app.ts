/**
 * Express app — assembles all routes for TASK-003/004/005
 * Base path /api/v1 per 04_API_SPEC.md § Base URL
 */

import cors from "cors";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { i18nMiddleware } from "./middleware/i18n";
import { traceMiddleware } from "./middleware/trace";
import { openApiSpec } from "./openapi";
import adminRoutes from "./routes/admin";
import aiRoutes from "./routes/ai";
import artifactRoutes from "./routes/artifacts";
import authRoutes from "./routes/auth";
import collaborationRoutes from "./routes/collaboration";
import conversationRoutes from "./routes/conversations";
import dashboardRoutes from "./routes/dashboard";
import documentRoutes from "./routes/documents";
import exportRoutes from "./routes/exports";
import orgRoutes from "./routes/orgs";
import webhookRoutes from "./routes/webhooks";
import workspaceRoutes from "./routes/workspaces";
import wellKnownRoutes from "./routes/well-known";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(traceMiddleware);
  app.use(i18nMiddleware as unknown as express.RequestHandler);

  // Health
  app.get("/health", (_req, res) => {
    res.json({ service: "core-api", version: "0.1.0", status: "ok" });
  });

  // OpenAPI spec
  app.get("/api/v1/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  // JWKS endpoint
  app.use(wellKnownRoutes);

  // Mount under /api/v1
  const v1 = express.Router();
  v1.use(authRoutes);
  v1.use(orgRoutes);
  v1.use(workspaceRoutes);
  v1.use(documentRoutes);
  v1.use(conversationRoutes);
  v1.use(aiRoutes);
  v1.use(artifactRoutes);
  v1.use(dashboardRoutes);
  v1.use(collaborationRoutes);
  v1.use(exportRoutes);
  v1.use(webhookRoutes);
  v1.use(adminRoutes);
  // Also mount ai routes at root for internal contract /ai/v1/* (02 §2.2)
  app.use(aiRoutes);

  // Also mount placeholder for other modules (documents, conversations, artifacts) — return 501 if not implemented
  // This keeps spec complete without breaking tests
  app.use("/api/v1", v1);

  // 404 for unknown api routes
  app.use("/api/v1", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  // Global error handler
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || 500;
    const code = status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR";
    res.status(status).json({ error: { code, message: err.message || "Internal error" } });
  });

  return app;
}

export default createApp;
