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
];

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  // 공개 경로는 인증 건너뜀
  if (PUBLIC_PATHS.some((path) => req.path === path || req.path.startsWith(path + "/"))) {
    return next();
  }

  // 쿠키 또는 Authorization 헤더에서 토큰 추출
  const token =
    req.cookies?.accessToken ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    // 토큰 없으면 통과 (me 엔드포인트 등에서 개별 처리)
    return next();
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
    (req as Request & { userId?: string }).userId = payload.userId;
  } catch {
    // 토큰 만료/유효하지 않음 - 통과시키되 userId 미설정
  }

  next();
}
