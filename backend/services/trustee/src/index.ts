import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, errorHandler, RabbitMQClient } from "@trustee/common";
import { EXCHANGE_NAME } from "@trustee/types";

import { config } from "./config";
import { TrusteeRepository, ContractRepository } from "./repositories";
import { TrusteeService, ContractService } from "./services";
import { TrusteeController, ContractController } from "./controllers";
import { createTrusteeRoutes, createContractRoutes } from "./routes";
import { startGrpcServer } from "./grpc-server";

const logger = createLogger("trustee-service");

async function main() {
  // Repositories
  const trusteeRepository = new TrusteeRepository();
  const contractRepository = new ContractRepository();

  // RabbitMQ
  let rabbitmq: RabbitMQClient | null = null;
  try {
    rabbitmq = new RabbitMQClient({
      url: config.rabbitmqUrl,
      exchange: EXCHANGE_NAME,
    });
    await rabbitmq.connect();
  } catch (error) {
    logger.warn(error, "RabbitMQ 연결 실패 - 이벤트 발행 없이 실행됩니다");
  }

  // Services
  const trusteeService = new TrusteeService(trusteeRepository, rabbitmq);
  const contractService = new ContractService(contractRepository, trusteeRepository);

  // Controllers
  const trusteeController = new TrusteeController(trusteeService);
  const contractController = new ContractController(contractService);

  // Express App
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "trustee-service",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Routes
  app.use("/api/trustees", createTrusteeRoutes(trusteeController));
  app.use("/api/contracts", createContractRoutes(contractController));

  // Error handler
  app.use(errorHandler);

  // Start HTTP server
  app.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, "HTTP server started");
  });

  // Start gRPC server
  startGrpcServer(trusteeRepository);

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
  logger.error(error, "Failed to start trustee service");
  process.exit(1);
});
