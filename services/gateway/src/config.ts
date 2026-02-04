export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  trusteeServiceUrl: process.env.TRUSTEE_SERVICE_URL || "http://localhost:4001",
  inspectionServiceUrl: process.env.INSPECTION_SERVICE_URL || "http://localhost:4002",
  trusteeGrpcAddress: process.env.TRUSTEE_GRPC_ADDRESS || "localhost:5001",
  inspectionGrpcAddress: process.env.INSPECTION_GRPC_ADDRESS || "localhost:5002",
  nodeEnv: process.env.NODE_ENV || "development",
};
