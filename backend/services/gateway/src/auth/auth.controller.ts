import { Request, Response, NextFunction } from "express";

import { AuthService } from "./auth.service";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export class AuthController {
  constructor(private service: AuthService) {}

  signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.service.signup(req.body);
      res.status(201).json({ data: { user } });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.login(req.body);

      res.cookie("accessToken", result.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 1000, // 1시간
      });

      res.cookie("refreshToken", result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      });

      res.json({
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.clearCookie("accessToken", COOKIE_OPTIONS);
      res.clearCookie("refreshToken", COOKIE_OPTIONS);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as Request & { userId?: string }).userId;
      if (!userId) {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" },
        });
        return;
      }
      const user = await this.service.me(userId);
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "리프레시 토큰이 없습니다" },
        });
        return;
      }

      const result = await this.service.refresh(refreshToken);

      res.cookie("accessToken", result.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 1000,
      });

      res.cookie("refreshToken", result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
