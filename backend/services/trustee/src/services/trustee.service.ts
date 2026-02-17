import { NotFoundError, ConflictError, RabbitMQClient } from "@trustee/common";
import { EVENT_ROUTING_KEYS } from "@trustee/types";
import { randomUUID } from "crypto";

import { TrusteeRepository } from "../repositories";

interface CreateTrusteeDto {
  companyName: string;
  businessNumber: string;
  representative: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  delegatedTasks: string;
  status?: "active" | "inactive" | "pending";
}

type UpdateTrusteeDto = Partial<CreateTrusteeDto>;

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export class TrusteeService {
  constructor(
    private repository: TrusteeRepository,
    private rabbitmq: RabbitMQClient | null
  ) {}

  async list(params: ListParams) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.search) {
      where.OR = [
        { companyName: { contains: params.search } },
        { businessNumber: { contains: params.search } },
        { contactName: { contains: params.search } },
      ];
    }
    if (params.status) {
      where.status = params.status;
    }

    const { data, total } = await this.repository.findAll({
      skip,
      take: limit,
      where,
      orderBy: { createdAt: "desc" },
    });

    return { data, total };
  }

  async getById(id: string) {
    const trustee = await this.repository.findById(id);
    if (!trustee) {
      throw new NotFoundError("Trustee", id);
    }
    return trustee;
  }

  async create(dto: CreateTrusteeDto) {
    const existing = await this.repository.findByBusinessNumber(dto.businessNumber);
    if (existing) {
      throw new ConflictError(`사업자번호 '${dto.businessNumber}'는 이미 등록되어 있습니다.`);
    }

    const trustee = await this.repository.create(dto);

    await this.publishEvent(EVENT_ROUTING_KEYS.TRUSTEE_CREATED, {
      type: "trustee.created",
      data: {
        id: trustee.id,
        companyName: trustee.companyName,
        businessNumber: trustee.businessNumber,
      },
    });

    return trustee;
  }

  async update(id: string, dto: UpdateTrusteeDto) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Trustee", id);
    }

    if (dto.businessNumber && dto.businessNumber !== existing.businessNumber) {
      const duplicate = await this.repository.findByBusinessNumber(dto.businessNumber);
      if (duplicate) {
        throw new ConflictError(`사업자번호 '${dto.businessNumber}'는 이미 등록되어 있습니다.`);
      }
    }

    const trustee = await this.repository.update(id, dto);

    const changes = Object.keys(dto).filter(
      (key) => dto[key as keyof UpdateTrusteeDto] !== undefined
    );

    await this.publishEvent(EVENT_ROUTING_KEYS.TRUSTEE_UPDATED, {
      type: "trustee.updated",
      data: {
        id: trustee.id,
        companyName: trustee.companyName,
        changes,
      },
    });

    return trustee;
  }

  async delete(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Trustee", id);
    }

    await this.repository.delete(id);

    await this.publishEvent(EVENT_ROUTING_KEYS.TRUSTEE_DELETED, {
      type: "trustee.deleted",
      data: {
        id: existing.id,
        companyName: existing.companyName,
      },
    });
  }

  async exists(id: string): Promise<boolean> {
    return this.repository.exists(id);
  }

  private async publishEvent(routingKey: string, event: Record<string, unknown>) {
    if (!this.rabbitmq) return;

    try {
      await this.rabbitmq.publish(routingKey, {
        ...event,
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        source: "trustee-service",
      });
    } catch {
      // 이벤트 발행 실패는 주요 동작을 차단하지 않음
    }
  }
}
