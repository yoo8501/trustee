import { NotFoundError, RabbitMQClient, createLogger } from "@trustee/common";
import { EVENT_ROUTING_KEYS } from "@trustee/types";
import { randomUUID } from "crypto";

import { validateTrusteeExists } from "../grpc-client";
import { InspectionRepository } from "../repositories";

const logger = createLogger("inspection-service");

interface CreateInspectionDto {
  trusteeId: string;
  inspectionDate: string;
  status?: "scheduled" | "in_progress" | "completed" | "cancelled";
}

interface UpdateInspectionDto {
  inspectionDate?: string;
  score?: number;
  status?: "scheduled" | "in_progress" | "completed" | "cancelled";
  findings?: string;
  improvements?: string;
}

interface ListParams {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
}

export class InspectionService {
  constructor(
    private repository: InspectionRepository,
    private rabbitmq: RabbitMQClient | null
  ) {}

  async list(params: ListParams) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.trusteeId) {
      where.trusteeId = params.trusteeId;
    }
    if (params.status) {
      where.status = params.status;
    }

    const { data, total } = await this.repository.findAll({
      skip,
      take: limit,
      where,
      orderBy: { inspectionDate: "desc" },
    });

    return { data, total };
  }

  async getById(id: string) {
    const inspection = await this.repository.findById(id);
    if (!inspection) {
      throw new NotFoundError("Inspection", id);
    }
    return inspection;
  }

  async getByTrusteeId(trusteeId: string) {
    return this.repository.findByTrusteeId(trusteeId);
  }

  async getLatestByTrusteeId(trusteeId: string) {
    return this.repository.findLatestByTrusteeId(trusteeId);
  }

  async create(dto: CreateInspectionDto) {
    // gRPC로 수탁사 존재 여부 확인
    try {
      const result = await validateTrusteeExists(dto.trusteeId);
      if (!result.exists) {
        throw new NotFoundError("Trustee", dto.trusteeId);
      }
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.warn(error, "수탁사 검증 실패 - gRPC 호출 불가");
    }

    const inspection = await this.repository.create({
      trusteeId: dto.trusteeId,
      inspectionDate: new Date(dto.inspectionDate),
      status: dto.status || "scheduled",
    });

    await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_CREATED, {
      type: "inspection.created",
      data: {
        id: inspection.id,
        trusteeId: inspection.trusteeId,
        inspectionDate: inspection.inspectionDate.toISOString(),
      },
    });

    return inspection;
  }

  async update(id: string, dto: UpdateInspectionDto) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Inspection", id);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.inspectionDate) updateData.inspectionDate = new Date(dto.inspectionDate);
    if (dto.score !== undefined) updateData.score = dto.score;
    if (dto.status) updateData.status = dto.status;
    if (dto.findings !== undefined) updateData.findings = dto.findings;
    if (dto.improvements !== undefined) updateData.improvements = dto.improvements;

    const inspection = await this.repository.update(id, updateData);

    if (dto.status === "completed") {
      await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_COMPLETED, {
        type: "inspection.completed",
        data: {
          id: inspection.id,
          trusteeId: inspection.trusteeId,
          score: inspection.score,
          status: inspection.status,
        },
      });
    }

    return inspection;
  }

  async delete(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Inspection", id);
    }
    await this.repository.delete(id);
  }

  async cancelByTrusteeId(trusteeId: string, reason: string) {
    const result = await this.repository.cancelByTrusteeId(trusteeId);
    logger.info({ trusteeId, count: result.count }, "수탁사 점검 일괄 취소");

    await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_CANCELLED, {
      type: "inspection.cancelled",
      data: {
        id: "",
        trusteeId,
        reason,
      },
    });

    return result;
  }

  private async publishEvent(routingKey: string, event: Record<string, unknown>) {
    if (!this.rabbitmq) return;

    try {
      await this.rabbitmq.publish(routingKey, {
        ...event,
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        source: "inspection-service",
      });
    } catch {
      // 이벤트 발행 실패는 주요 동작을 차단하지 않음
    }
  }
}
