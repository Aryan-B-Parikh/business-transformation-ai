/**
 * Error helpers — 04_API_SPEC.md § Conventions
 * Errors: { "error": { "code": string, "message": string } }
 */

import { Response } from "express";

export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function notFound(res: Response, message = "Not found"): void {
  sendError(res, 404, "NOT_FOUND", message);
}

export function badRequest(res: Response, message: string, code = "BAD_REQUEST"): void {
  sendError(res, 400, code, message);
}

export function forbidden(res: Response, message: string): void {
  sendError(res, 403, "FORBIDDEN", message);
}

export function unauthorized(res: Response, message = "Unauthorized"): void {
  sendError(res, 401, "UNAUTHORIZED", message);
}
