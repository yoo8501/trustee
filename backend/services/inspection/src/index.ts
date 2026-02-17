import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, errorHandler, RabbitMQClient } from "@trustee/common";
import { EXCHANGE_NAME } from "@trustee/types";

import { config } from "./config";
import { InspectionRepository, InspectionItemRepository } from "./repositories";
import { InspectionService, InspectionItemService } from "./services";
import { InspectionController, InspectionItemController } from "./controllers";
import { createInspectionRoutes, createInspectionItemRoutes } from "./routes";
import { startGrpcServer } from "./grpc-server";
import { setupEventHandlers } from "./event-handlers";

const logger = createLogger("inspection-service");

async function main() {
  // Repositories
  const inspectionRepository = new InspectionRepository();
  const inspectionItemRepository = new InspectionItemRepository();

  // RabbitMQ
  let rabbitmq: RabbitMQClient | null = null;
  try {
    rabbitmq = new RabbitMQClient({
      url: config.rabbitmqUrl,
      exchange: EXCHANGE_NAME,
    });
    await rabbitmq.connect();
  } catch (error) {
    logger.warn(error, "RabbitMQ 연결 실패 - 이벤트 처리 없이 실행됩니다");
  }

  // Services
  const inspectionService = new InspectionService(inspectionRepository, rabbitmq);
  const inspectionItemService = new InspectionItemService(
    inspectionItemRepository,
    inspectionRepository
  );

  // Event handlers
  if (rabbitmq) {
    await setupEventHandlers(rabbitmq, inspectionService);
  }

  // Controllers
  const inspectionController = new InspectionController(inspectionService);
  const inspectionItemController = new InspectionItemController(inspectionItemService);

  // Express App
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "inspection-service",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Routes
  app.use("/api/inspections", createInspectionRoutes(inspectionController));
  app.use("/api/inspection-items", createInspectionItemRoutes(inspectionItemController));

  // Error handler
  app.use(errorHandler);

  // Start HTTP server
  app.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, "HTTP server started");
  });

  // Start gRPC server
  startGrpcServer(inspectionRepository);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    await rabbitmq?.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error(error, "Failed to start inspection service");
  process.exit(1);
});
