import { Request, Response, NextFunction } from "express";

import { AppError } from "../errors";
import { createLogger } from "../logger";

const logger = createLogger("error-handler");

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // validate 미들웨어 등에서 statusCode를 직접 부여한 에러 처리
  const errWithStatus = err as Error & { statusCode?: number; code?: string; details?: Record<string, string[]> };
  if (errWithStatus.statusCode) {
    res.status(errWithStatus.statusCode).json({
      error: {
        code: errWithStatus.code || "ERROR",
        message: err.message,
        ...(errWithStatus.details && { details: errWithStatus.details }),
      },
    });
    return;
  }

  logger.error(err, "Unhandled error");

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
}
