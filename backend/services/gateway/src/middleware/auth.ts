import { Request, Response, NextFunction } from "express";

// 인증 미들웨어 placeholder
// TODO: JWT 토큰 검증 구현
export function authMiddleware(_req: Request, _res: Response, next: NextFunction) {
  // 현재는 모든 요청 허용
  next();
}
