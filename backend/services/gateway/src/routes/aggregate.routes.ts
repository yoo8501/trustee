import { Router, Request, Response, NextFunction } from "express";
import { createGrpcClient } from "@trustee/common";
import { TRUSTEE_PROTO_PATH, INSPECTION_PROTO_PATH } from "@trustee/proto";
import * as grpc from "@grpc/grpc-js";

import { config } from "../config";

interface TrusteeResponse {
  id: string;
  companyName: string;
  businessNumber: string;
  representative: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  delegatedTasks: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface InspectionResponse {
  id: string;
  trusteeId: string;
  inspectionDate: string;
  score: number;
  status: string;
  findings: string;
  improvements: string;
  createdAt: string;
  updatedAt: string;
}

interface TrusteeGrpcClient {
  getTrustee(
    request: { id: string },
    callback: (error: Error | null, response: TrusteeResponse) => void
  ): void;
}

interface InspectionGrpcClient {
  getLatestInspection(
    request: { trusteeId: string },
    callback: (error: grpc.ServiceError | null, response: InspectionResponse) => void
  ): void;
}

let trusteeClient: TrusteeGrpcClient | null = null;
let inspectionClient: InspectionGrpcClient | null = null;

function getTrusteeClient(): TrusteeGrpcClient {
  if (!trusteeClient) {
    trusteeClient = createGrpcClient<TrusteeGrpcClient>(
      TRUSTEE_PROTO_PATH,
      "trustee",
      "TrusteeService",
      config.trusteeGrpcAddress
    );
  }
  return trusteeClient;
}

function getInspectionClient(): InspectionGrpcClient {
  if (!inspectionClient) {
    inspectionClient = createGrpcClient<InspectionGrpcClient>(
      INSPECTION_PROTO_PATH,
      "inspection",
      "InspectionService",
      config.inspectionGrpcAddress
    );
  }
  return inspectionClient;
}

function grpcCall<T>(
  fn: (callback: (error: Error | null, response: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

export function createAggregateRoutes(): Router {
  const router = Router();

  // 수탁사 요약 정보 (수탁사 + 최신 점검 결합)
  router.get(
    "/trustees/:id/summary",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = req.params.id as string;
        const trusteeClient = getTrusteeClient();
        const inspectionClient = getInspectionClient();

        const trustee = await grpcCall<TrusteeResponse>((cb) =>
          trusteeClient.getTrustee({ id }, cb)
        );

        let latestInspection: InspectionResponse | null = null;
        try {
          latestInspection = await grpcCall<InspectionResponse>((cb) =>
            inspectionClient.getLatestInspection({ trusteeId: id }, cb)
          );
        } catch {
          // 점검 없음 - null 유지
        }

        res.json({
          data: {
            ...trustee,
            latestInspection: latestInspection
              ? {
                  id: latestInspection.id,
                  inspectionDate: latestInspection.inspectionDate,
                  score: latestInspection.score,
                  status: latestInspection.status,
                }
              : null,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
