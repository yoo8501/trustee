import { createGrpcClient } from "@trustee/common";
import { TRUSTEE_PROTO_PATH } from "@trustee/proto";

import { config } from "./config";

interface ValidateResponse {
  exists: boolean;
  companyName: string;
}

interface TrusteeGrpcClient {
  validateTrusteeExists(
    request: { id: string },
    callback: (error: Error | null, response: ValidateResponse) => void
  ): void;
}

let client: TrusteeGrpcClient | null = null;

export function getTrusteeGrpcClient(): TrusteeGrpcClient {
  if (!client) {
    client = createGrpcClient<TrusteeGrpcClient>(
      TRUSTEE_PROTO_PATH,
      "trustee",
      "TrusteeService",
      config.trusteeGrpcAddress
    );
  }
  return client;
}

export function validateTrusteeExists(trusteeId: string): Promise<ValidateResponse> {
  return new Promise((resolve, reject) => {
    const grpcClient = getTrusteeGrpcClient();
    grpcClient.validateTrusteeExists({ id: trusteeId }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}
