import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
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
import journeyRoutes from "./routes/journey";
import orgRoutes from "./routes/orgs";
import webhookRoutes from "./routes/webhooks";
import wellKnownRoutes from "./routes/well-known";
import workspaceRoutes from "./routes/workspaces";

export function createApp(): express.Express {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173").split(",").map((v) => v.trim()).filter(Boolean);

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.use(traceMiddleware);
  app.use(i18nMiddleware as unknown as express.RequestHandler);

  app.get("/health", (_req, res) => res.json({ service: "core-api", version: "0.1.0", status: "ok" }));
  app.get("/healthz", (_req, res) => res.json({ status: "healthy", timestamp: new Date().toISOString() }));
  app.get("/readyz", async (_req, res) => {
    try {
      res.json({ status: "ready", timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "not ready" });
    }
  });
  app.get("/api/v1/openapi.json", (_req, res) => res.json(openApiSpec));
  app.use(wellKnownRoutes);

  const v1 = express.Router();
  v1.use(authRoutes);
  v1.use(orgRoutes);
  v1.use(workspaceRoutes);
  v1.use(documentRoutes);
  v1.use(journeyRoutes);
  v1.use(conversationRoutes);
  v1.use(aiRoutes);
  v1.use(artifactRoutes);
  v1.use(dashboardRoutes);
  v1.use(collaborationRoutes);
  v1.use(exportRoutes);
  v1.use(webhookRoutes);
  v1.use(adminRoutes);
  app.use(aiRoutes);
  app.use("/api/v1", v1);
  app.use("/api/v1", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    const code = status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR";
    if (status >= 500) console.error(err);
    res.status(status).json({ error: { code, message: status >= 500 ? "Internal error" : err.message || "Request failed" } });
  });
  return app;
}

export default createApp;
