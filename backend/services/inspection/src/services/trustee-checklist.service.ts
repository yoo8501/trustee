import { NotFoundError, ValidationError, RabbitMQClient, createLogger } from "@trustee/common";
import { EVENT_ROUTING_KEYS } from "@trustee/types";
import type {
  CreateTrusteeChecklistInput,
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
} from "@trustee/types";
import { randomUUID } from "crypto";

import { validateTrusteeExists } from "../grpc-client";
import { ChecklistTemplateRepository } from "../repositories";
import { TrusteeChecklistRepository } from "../repositories";

const logger = createLogger("trustee-checklist-service");

interface ListParams {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
}

export class TrusteeChecklistService {
  constructor(
    private repository: TrusteeChecklistRepository,
    private templateRepository: ChecklistTemplateRepository,
    private rabbitmq: RabbitMQClient | null
  ) {}

  async list(params: ListParams) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.trusteeId) where.trusteeId = params.trusteeId;
    if (params.status) where.status = params.status;

    return this.repository.findAll({ skip, take: limit, where });
  }

  async getById(id: string) {
    const checklist = await this.repository.findById(id);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", id);
    }
    return checklist;
  }

  async create(dto: CreateTrusteeChecklistInput) {
    // 1. gRPC로 수탁사 존재 확인
    try {
      const result = await validateTrusteeExists(dto.trusteeId);
      if (!result.exists) {
        throw new NotFoundError("Trustee", dto.trusteeId);
      }
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.warn(error, "수탁사 검증 실패 - gRPC 호출 불가");
    }

    // 2. Root 템플릿 전체 조회
    const template = await this.templateRepository.findById(dto.templateId);
    if (!template) {
      throw new NotFoundError("ChecklistTemplate", dto.templateId);
    }

    // 3. 스냅샷 Deep Copy (트랜잭션)
    const checklist = await this.repository.createFromTemplate({
      trusteeId: dto.trusteeId,
      template,
      inspectionScope: dto.inspectionScope,
      accessTokenExpiresAt: new Date(dto.deadline),
    });

    // 4. 생성 후 상태를 sent로 변경 (토큰 링크 발급 완료 의미)
    const updated = await this.repository.update(checklist.id, { status: "sent" });

    await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_CREATED, {
      type: "checklist.created",
      data: {
        id: updated.id,
        trusteeId: updated.trusteeId,
        templateId: dto.templateId,
        accessToken: updated.accessToken,
      },
    });

    return updated;
  }

  async update(id: string, dto: UpdateTrusteeChecklistInput) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("TrusteeChecklist", id);
    }

    // reviewed 상태로 변경 시: 기한 만료 + submitted 확인
    if (dto.status === "reviewed") {
      if (!existing.accessTokenExpiresAt || new Date() < new Date(existing.accessTokenExpiresAt)) {
        throw new ValidationError("작성 기한이 종료된 후에만 검토를 진행할 수 있습니다.");
      }
      if (existing.status !== "submitted") {
        throw new ValidationError("제출된 체크리스트만 검토할 수 있습니다.");
      }
    }

    // deadline 변경 시: 기한 만료 전에만 가능
    if (dto.deadline) {
      if (existing.accessTokenExpiresAt && new Date() > new Date(existing.accessTokenExpiresAt)) {
        throw new ValidationError("이미 만료된 기한은 변경할 수 없습니다.");
      }
      const { deadline, ...rest } = dto;
      return this.repository.update(id, {
        ...rest,
        accessTokenExpiresAt: new Date(deadline),
      });
    }

    return this.repository.update(id, dto);
  }

  async updateItem(checklistId: string, itemId: string, dto: UpdateTrusteeChecklistItemInput) {
    const checklist = await this.repository.findById(checklistId);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", checklistId);
    }
    return this.repository.updateItem(itemId, dto);
  }

  async batchUpdateItems(checklistId: string, dto: BatchUpdateChecklistItemsInput) {
    const checklist = await this.repository.findById(checklistId);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", checklistId);
    }
    return this.repository.batchUpdateItems(dto.items);
  }

  async regenerateToken(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("TrusteeChecklist", id);
    }
    return this.repository.regenerateToken(id);
  }

  async delete(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("TrusteeChecklist", id);
    }
    await this.repository.delete(id);
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
