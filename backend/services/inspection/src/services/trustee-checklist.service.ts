import { NotFoundError, ValidationError, RabbitMQClient, createLogger } from "@trustee/common";
import { EVENT_ROUTING_KEYS } from "@trustee/types";
import type {
  CreateTrusteeChecklistInput,
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
  RejectChecklistInput,
  SnapshotItemData,
  ChecklistDiffResult,
  ChecklistDiffItem,
  ChecklistDiffField,
  ScoringResult,
} from "@trustee/types";
import { randomUUID } from "crypto";

import { validateTrusteeExists } from "../grpc-client";
import { ChecklistTemplateRepository } from "../repositories";
import { TrusteeChecklistRepository } from "../repositories";
import { ScoringService } from "./scoring.service";

const logger = createLogger("trustee-checklist-service");

interface ListParams {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
  search?: string;
}

export class TrusteeChecklistService {
  constructor(
    private repository: TrusteeChecklistRepository,
    private templateRepository: ChecklistTemplateRepository,
    private rabbitmq: RabbitMQClient | null,
    private scoringService: ScoringService
  ) {}

  async list(params: ListParams) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.trusteeId) where.trusteeId = params.trusteeId;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search } },
        { contactName: { contains: params.search } },
      ];
    }

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

  // ── 스코어링 ──

  async score(id: string): Promise<ScoringResult> {
    const checklist = await this.repository.findById(id);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", id);
    }

    if (checklist.status !== "submitted" && checklist.status !== "reviewed") {
      throw new ValidationError("제출 또는 검토 상태의 체크리스트만 점수를 산정할 수 있습니다.");
    }

    const result = this.scoringService.calculate(checklist);

    // DB에 점수 저장
    await this.repository.update(id, {
      totalScore: result.totalScore,
      grade: result.grade,
      scoreDetail: JSON.parse(JSON.stringify(result)),
      scoredAt: new Date(),
    });

    return result;
  }

  async getStats() {
    return this.repository.getStats();
  }

  async getRecentSubmitted(limit: number = 5) {
    return this.repository.findRecentSubmitted(limit);
  }

  // ── 검토/반려 ──

  async reject(id: string, dto: RejectChecklistInput) {
    const checklist = await this.repository.findById(id);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", id);
    }
    if (checklist.status !== "submitted") {
      throw new ValidationError("제출된 체크리스트만 반려할 수 있습니다.");
    }

    const newDeadline = new Date(dto.newDeadline);
    if (newDeadline <= new Date()) {
      throw new ValidationError("새 작성 기한은 현재 시각 이후여야 합니다.");
    }

    const newRound = (checklist.reviewRound || 0) + 1;
    const result = await this.repository.reject({
      checklistId: id,
      items: dto.items,
      reviewRound: newRound,
      newDeadline,
    });

    await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_CREATED, {
      type: "checklist.rejected",
      data: {
        id: checklist.id,
        trusteeId: checklist.trusteeId,
        reviewRound: newRound,
        rejectedCount: dto.items.filter((i) => i.status === "rejected").length,
      },
    });

    return result;
  }

  async review(id: string) {
    const checklist = await this.repository.findById(id);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", id);
    }
    if (checklist.status !== "submitted") {
      throw new ValidationError("제출된 체크리스트만 검토할 수 있습니다.");
    }
    return this.repository.update(id, { status: "reviewed" });
  }

  async getSnapshots(id: string) {
    const checklist = await this.repository.findById(id);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", id);
    }
    return this.repository.findSnapshotsMeta(id);
  }

  async getDiff(id: string, round?: number): Promise<ChecklistDiffResult> {
    const checklist = await this.repository.findById(id);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", id);
    }

    const snapshots = await this.repository.findSnapshots(id);
    if (snapshots.length < 2) {
      throw new ValidationError("비교할 스냅샷이 부족합니다 (최소 2건 필요).");
    }

    const current = round
      ? snapshots.find((s) => s.round === round)
      : snapshots[snapshots.length - 1];
    const previous = round
      ? snapshots.find((s) => s.round === round - 1)
      : snapshots[snapshots.length - 2];

    if (!current || !previous) {
      throw new ValidationError("비교 대상 스냅샷을 찾을 수 없습니다.");
    }

    return this.buildDiff(
      previous.round, previous.data as unknown as SnapshotItemData[],
      current.round, current.data as unknown as SnapshotItemData[],
    );
  }

  async getReviews(id: string, round?: number) {
    const checklist = await this.repository.findById(id);
    if (!checklist) {
      throw new NotFoundError("TrusteeChecklist", id);
    }
    const targetRound = round ?? checklist.reviewRound;
    return this.repository.findReviews(id, targetRound || undefined);
  }

  private buildDiff(
    prevRound: number,
    prevData: SnapshotItemData[],
    currRound: number,
    currData: SnapshotItemData[],
  ): ChecklistDiffResult {
    const prevMap = new Map(prevData.map((item) => [item.itemId, item]));
    const changes: ChecklistDiffItem[] = [];

    for (const curr of currData) {
      const prev = prevMap.get(curr.itemId);
      if (!prev) continue;

      const fields: ChecklistDiffField[] = [
        {
          field: "answer",
          previous: prev.answer,
          current: curr.answer,
          changed: prev.answer !== curr.answer,
        },
        {
          field: "currentStatus",
          previous: prev.currentStatus,
          current: curr.currentStatus,
          changed: prev.currentStatus !== curr.currentStatus,
        },
        {
          field: "remarks",
          previous: prev.remarks,
          current: curr.remarks,
          changed: prev.remarks !== curr.remarks,
        },
        {
          field: "evidenceFiles",
          previous: prev.evidenceFileNames.join(", ") || null,
          current: curr.evidenceFileNames.join(", ") || null,
          changed: prev.evidenceFileNames.join(",") !== curr.evidenceFileNames.join(","),
        },
        {
          field: "applicable",
          previous: String(prev.applicable),
          current: String(curr.applicable),
          changed: prev.applicable !== curr.applicable,
        },
      ];

      if (fields.some((f) => f.changed)) {
        changes.push({
          itemId: curr.itemId,
          no: curr.no,
          question: curr.question,
          fields,
        });
      }
    }

    return { previousRound: prevRound, currentRound: currRound, changes };
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
