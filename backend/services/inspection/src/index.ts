import express from "express";
import helmet from "helmet";
import { createLogger, errorHandler, RabbitMQClient } from "@trustee/common";
import { EXCHANGE_NAME } from "@trustee/types";

import { config } from "./config";
import { InspectionRepository, InspectionItemRepository, ChecklistTemplateRepository, TrusteeChecklistRepository } from "./repositories";
import { InspectionService, InspectionItemService, ChecklistTemplateService, TrusteeChecklistService, ChecklistResponseService, ScoringService } from "./services";
import { InspectionController, InspectionItemController, ChecklistTemplateController, TrusteeChecklistController, ChecklistResponseController } from "./controllers";
import { createInspectionRoutes, createInspectionItemRoutes, createChecklistTemplateRoutes, createTrusteeChecklistRoutes, createChecklistResponseRoutes } from "./routes";
import { startGrpcServer } from "./grpc-server";
import { setupEventHandlers } from "./event-handlers";
import { LocalStorageProvider } from "./storage";

const logger = createLogger("inspection-service");

async function main() {
  // Repositories
  const inspectionRepository = new InspectionRepository();
  const inspectionItemRepository = new InspectionItemRepository();
  const checklistTemplateRepository = new ChecklistTemplateRepository();
  const trusteeChecklistRepository = new TrusteeChecklistRepository();

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

  // Scoring Service
  const scoringService = new ScoringService();

  // Checklist Services
  const checklistTemplateService = new ChecklistTemplateService(checklistTemplateRepository);
  const trusteeChecklistService = new TrusteeChecklistService(
    trusteeChecklistRepository,
    checklistTemplateRepository,
    rabbitmq,
    scoringService
  );

  // Storage Provider
  const storageProvider = new LocalStorageProvider();

  // Checklist Response Service (수탁사 토큰 API)
  const checklistResponseService = new ChecklistResponseService(
    trusteeChecklistRepository,
    rabbitmq,
    storageProvider,
    scoringService
  );

  // Controllers
  const inspectionController = new InspectionController(inspectionService);
  const inspectionItemController = new InspectionItemController(inspectionItemService);
  const checklistTemplateController = new ChecklistTemplateController(checklistTemplateService);
  const trusteeChecklistController = new TrusteeChecklistController(trusteeChecklistService);
  const checklistResponseController = new ChecklistResponseController(checklistResponseService);

  // Express App
  const app = express();
  app.use(helmet());
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
  app.use("/api/checklist-templates", createChecklistTemplateRoutes(checklistTemplateController));
  app.use("/api/trustee-checklists", createTrusteeChecklistRoutes(trusteeChecklistController));
  app.use("/api/checklist-response", createChecklistResponseRoutes(checklistResponseController));

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
