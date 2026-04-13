import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ERROR_CODES, sendError } from "../types/api-error.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, "Request payload is invalid", err.issues);
    return;
  }

  if (err instanceof Error) {
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, err.message);
    return;
  }

  sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, "unknown_error");
}
