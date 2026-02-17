import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError, ConflictError } from "@trustee/common";

import { UserRepository } from "./user.repository";
import { config } from "../config";

interface SignupDto {
  name: string;
  email: string;
  password: string;
}

interface LoginDto {
  email: string;
  password: string;
}

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

function toUserResponse(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export class AuthService {
  constructor(private repository: UserRepository) {}

  async signup(dto: SignupDto) {
    const existing = await this.repository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError("이미 등록된 이메일입니다");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.repository.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
    });

    return toUserResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.repository.findByEmail(dto.email);
    if (!user) {
      throw new AppError("이메일 또는 비밀번호가 올바르지 않습니다", 401, "INVALID_CREDENTIALS");
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new AppError("이메일 또는 비밀번호가 올바르지 않습니다", 401, "INVALID_CREDENTIALS");
    }

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwtSecret, {
      expiresIn: "1h",
    });

    const refreshToken = jwt.sign(payload, config.jwtRefreshSecret, {
      expiresIn: "7d",
    });

    return {
      user: toUserResponse(user),
      accessToken,
      refreshToken,
    };
  }

  async me(userId: string) {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new AppError("사용자를 찾을 수 없습니다", 401, "UNAUTHORIZED");
    }
    return toUserResponse(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as TokenPayload;

      const user = await this.repository.findById(payload.userId);
      if (!user) {
        throw new AppError("사용자를 찾을 수 없습니다", 401, "UNAUTHORIZED");
      }

      const newPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const newAccessToken = jwt.sign(newPayload, config.jwtSecret, {
        expiresIn: "1h",
      });

      const newRefreshToken = jwt.sign(newPayload, config.jwtRefreshSecret, {
        expiresIn: "7d",
      });

      return {
        user: toUserResponse(user),
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch {
      throw new AppError("유효하지 않은 토큰입니다", 401, "INVALID_TOKEN");
    }
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch {
      throw new AppError("유효하지 않은 토큰입니다", 401, "INVALID_TOKEN");
    }
  }
}
