/**
 * i18n middleware — TASK-030
 * Extracts language from Accept-Language header or ?lang query, attaches to req
 * AI responses requested in user's selected language per PRD §6
 */

import { normalizeLanguage, SupportedLanguage } from "@bta/shared";
import { Request, Response, NextFunction } from "express";

export interface I18nRequest extends Request {
  lang: SupportedLanguage;
}

export function i18nMiddleware(req: I18nRequest, _res: Response, next: NextFunction): void {
  // Priority: ?lang query > Accept-Language header > default en
  const queryLang = typeof req.query.lang === "string" ? req.query.lang : Array.isArray(req.query.lang) ? (req.query.lang[0] as string) : undefined;
  const headerLang = req.headers["accept-language"]?.split(",")[0]?.split(";")[0]?.trim();
  const raw = queryLang || headerLang || "en";
  req.lang = normalizeLanguage(raw);
  next();
}

export function getRequestLang(req: Request): SupportedLanguage {
  return (req as I18nRequest).lang || "en";
}
