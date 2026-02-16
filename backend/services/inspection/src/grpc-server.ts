import { createGrpcServer } from "@trustee/common";
import { INSPECTION_PROTO_PATH } from "@trustee/proto";
import * as grpc from "@grpc/grpc-js";

import { config } from "./config";
import { InspectionRepository } from "./repositories";

export function startGrpcServer(repository: InspectionRepository) {
  const implementations: grpc.UntypedServiceImplementation = {
    getInspectionsByTrustee: async (
      call: grpc.ServerUnaryCall<{ trusteeId: string }, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const inspections = await repository.findByTrusteeId(call.request.trusteeId);
        callback(null, {
          inspections: inspections.map((i) => ({
            id: i.id,
            trusteeId: i.trusteeId,
            inspectionDate: i.inspectionDate.toISOString(),
            score: i.score || 0,
            status: i.status,
            findings: i.findings || "",
            improvements: i.improvements || "",
            createdAt: i.createdAt.toISOString(),
            updatedAt: i.updatedAt.toISOString(),
          })),
        });
      } catch {
        callback({
          code: grpc.status.INTERNAL,
          message: "Internal server error",
        });
      }
    },

    getLatestInspection: async (
      call: grpc.ServerUnaryCall<{ trusteeId: string }, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const inspection = await repository.findLatestByTrusteeId(call.request.trusteeId);
        if (!inspection) {
          callback({
            code: grpc.status.NOT_FOUND,
            message: "No inspections found",
          });
          return;
        }
        callback(null, {
          id: inspection.id,
          trusteeId: inspection.trusteeId,
          inspectionDate: inspection.inspectionDate.toISOString(),
          score: inspection.score || 0,
          status: inspection.status,
          findings: inspection.findings || "",
          improvements: inspection.improvements || "",
          createdAt: inspection.createdAt.toISOString(),
          updatedAt: inspection.updatedAt.toISOString(),
        });
      } catch {
        callback({
          code: grpc.status.INTERNAL,
          message: "Internal server error",
        });
      }
    },
  };

  return createGrpcServer(
    {
      port: config.grpcPort,
      protoPath: INSPECTION_PROTO_PATH,
      packageName: "inspection",
      serviceName: "InspectionService",
    },
    implementations
  );
}
