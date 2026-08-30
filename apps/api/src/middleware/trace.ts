import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Attaches a unique correlation_id to every incoming request.
 * Fulfills Phase 23 (Observability) requirements.
 */
export function traceMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use existing header if it exists (e.g. from a gateway), otherwise generate one
  const correlationId = req.headers["x-correlation-id"] as string || uuidv4();
  
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);

  // Here we would also bind this ID to an async local storage context 
  // for logger injection.

  next();
}
