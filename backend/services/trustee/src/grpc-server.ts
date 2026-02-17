import { createGrpcServer } from "@trustee/common";
import { TRUSTEE_PROTO_PATH } from "@trustee/proto";
import * as grpc from "@grpc/grpc-js";

import { config } from "./config";
import { TrusteeRepository } from "./repositories";

export function startGrpcServer(repository: TrusteeRepository) {
  const implementations: grpc.UntypedServiceImplementation = {
    getTrustee: async (
      call: grpc.ServerUnaryCall<{ id: string }, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const trustee = await repository.findById(call.request.id);
        if (!trustee) {
          callback({
            code: grpc.status.NOT_FOUND,
            message: `Trustee ${call.request.id} not found`,
          });
          return;
        }
        callback(null, {
          id: trustee.id,
          companyName: trustee.companyName,
          businessNumber: trustee.businessNumber,
          representative: trustee.representative,
          contactName: trustee.contactName,
          contactPhone: trustee.contactPhone,
          contactEmail: trustee.contactEmail,
          delegatedTasks: trustee.delegatedTasks,
          status: trustee.status,
          createdAt: trustee.createdAt.toISOString(),
          updatedAt: trustee.updatedAt.toISOString(),
        });
      } catch {
        callback({
          code: grpc.status.INTERNAL,
          message: "Internal server error",
        });
      }
    },

    validateTrusteeExists: async (
      call: grpc.ServerUnaryCall<{ id: string }, unknown>,
      callback: grpc.sendUnaryData<unknown>
    ) => {
      try {
        const trustee = await repository.findById(call.request.id);
        callback(null, {
          exists: !!trustee,
          companyName: trustee?.companyName || "",
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
      protoPath: TRUSTEE_PROTO_PATH,
      packageName: "trustee",
      serviceName: "TrusteeService",
    },
    implementations
  );
}
