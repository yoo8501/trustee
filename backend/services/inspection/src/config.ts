export const config = {
  httpPort: parseInt(process.env.HTTP_PORT || "4002", 10),
  grpcPort: parseInt(process.env.GRPC_PORT || "5002", 10),
  databaseUrl: process.env.DATABASE_URL || "mysql://trustee:trusteepassword@localhost:3306/inspection_db",
  rabbitmqUrl: process.env.RABBITMQ_URL || "amqp://trustee:trusteepassword@localhost:5672",
  trusteeGrpcAddress: process.env.TRUSTEE_GRPC_ADDRESS || "localhost:5001",
  nodeEnv: process.env.NODE_ENV || "development",
};
