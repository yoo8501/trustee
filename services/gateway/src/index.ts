import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createLogger, errorHandler } from "@trustee/common";

import { config } from "./config";
import { trusteeProxy, inspectionProxy } from "./proxy";
import { authMiddleware } from "./middleware";
import { createAggregateRoutes } from "./routes";

const logger = createLogger("gateway");

const app = express();

// 기본 미들웨어
app.use(helmet());
app.use(cors());
app.use(express.json());

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

// 집계 엔드포인트 (프록시 전에 등록)
app.use("/api/aggregate", createAggregateRoutes());

// 프록시 라우팅
app.use("/api/trustees", trusteeProxy);
app.use("/api/contracts", trusteeProxy);
app.use("/api/inspections", inspectionProxy);
app.use("/api/inspection-items", inspectionProxy);

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
