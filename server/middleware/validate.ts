import type { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      console.error("Validation failed", {
        path: req.originalUrl,
        method: req.method,
        body: req.body,
        zodIssues: result.error.issues,
      });
      res.status(400).json({
        error: "Validation failed",
        details: result.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateUuid(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const val = req.params[paramName];
    if (!val || typeof val !== "string" || val.trim() === "") {
      res.status(400).json({ error: `Invalid ${paramName}: must be a non-empty string` });
      return;
    }
    next();
  };
}
