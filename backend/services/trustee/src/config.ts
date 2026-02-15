export const config = {
  httpPort: parseInt(process.env.HTTP_PORT || "4001", 10),
  grpcPort: parseInt(process.env.GRPC_PORT || "5001", 10),
  databaseUrl: process.env.DATABASE_URL || "mysql://trustee:trusteepassword@localhost:3306/trustee_db",
  rabbitmqUrl: process.env.RABBITMQ_URL || "amqp://trustee:trusteepassword@localhost:5672",
  nodeEnv: process.env.NODE_ENV || "development",
};
