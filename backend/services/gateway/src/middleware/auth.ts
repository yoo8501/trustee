import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { config } from "../config";

// 인증이 필요 없는 경로
const PUBLIC_PATHS = [
  "/health",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/social/google",
  "/api/auth/social/github",
  "/api/checklist-response",
];

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 공개 경로는 인증 건너뜀
  if (PUBLIC_PATHS.some((path) => req.path === path || req.path.startsWith(path + "/"))) {
    return next();
  }

  // 쿠키 또는 Authorization 헤더에서 토큰 추출
  const token =
    req.cookies?.accessToken ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
    (req as Request & { userId?: string }).userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "유효하지 않은 인증 토큰입니다." } });
  }
}
