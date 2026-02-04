import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details: Record<string, string[]> = {};
        for (const issue of error.issues) {
          const path = issue.path.join(".");
          if (!details[path]) {
            details[path] = [];
          }
          details[path].push(issue.message);
        }
        next(
          Object.assign(new Error("Validation failed"), {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            details,
          })
        );
        return;
      }
      next(error);
    }
  };
}
