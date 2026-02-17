import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { createLogger, errorHandler } from "@trustee/common";

import { config } from "./config";
import { trusteeProxy, inspectionProxy } from "./proxy";
import { authMiddleware } from "./middleware";
import { createAggregateRoutes } from "./routes";
import { UserRepository, AuthService, AuthController, createAuthRoutes } from "./auth";

const logger = createLogger("gateway");

const app = express();

// 기본 미들웨어
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000, // 최대 1000 요청
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 인증 미들웨어
app.use(authMiddleware);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "gateway",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 인증 라우트 (프록시 전에 등록)
const userRepository = new UserRepository();
const authService = new AuthService(userRepository);
const authController = new AuthController(authService);
app.use("/api/auth", createAuthRoutes(authController));

// 집계 엔드포인트 (프록시 전에 등록)
app.use("/api/aggregate", createAggregateRoutes());

// 프록시 라우팅 (pathFilter로 경로 매칭)
app.use(trusteeProxy);
app.use(inspectionProxy);

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info({ port: config.port }, "API Gateway started");
  logger.info({
    trusteeService: config.trusteeServiceUrl,
    inspectionService: config.inspectionServiceUrl,
  }, "Service endpoints configured");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("Shutting down...");
  process.exit(0);
});
