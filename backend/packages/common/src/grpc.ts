import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

import { createLogger } from "./logger";

const logger = createLogger("grpc");

export interface GrpcServerConfig {
  port: number;
  protoPath: string;
  packageName: string;
  serviceName: string;
}

export function loadProto(protoPath: string) {
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

export function createGrpcServer(
  config: GrpcServerConfig,
  implementations: grpc.UntypedServiceImplementation
): grpc.Server {
  const proto = loadProto(config.protoPath);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg = proto[config.packageName] as any;
  const service = pkg[config.serviceName].service;

  const server = new grpc.Server();
  server.addService(service, implementations);

  server.bindAsync(
    `0.0.0.0:${config.port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        logger.error(err, "Failed to start gRPC server");
        throw err;
      }
      logger.info({ port }, "gRPC server started");
    }
  );

  return server;
}

export function createGrpcClient<T>(
  protoPath: string,
  packageName: string,
  serviceName: string,
  address: string
): T {
  const proto = loadProto(protoPath);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg = proto[packageName] as any;
  const Client = pkg[serviceName];

  return new Client(
    address,
    grpc.credentials.createInsecure()
  ) as T;
}
