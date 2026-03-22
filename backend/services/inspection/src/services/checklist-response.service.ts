import { NotFoundError, ForbiddenError, ValidationError, RabbitMQClient } from "@trustee/common";
import { EVENT_ROUTING_KEYS } from "@trustee/types";
import type {
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
  SubmitTrusteeChecklistInput,
} from "@trustee/types";
import { randomUUID } from "crypto";

import { TrusteeChecklistRepository } from "../repositories";
import type { StorageProvider, UploadedFile } from "../storage";
import { ScoringService } from "./scoring.service";

const MAX_FILES_PER_ITEM = 5;

export class ChecklistResponseService {
  constructor(
    private repository: TrusteeChecklistRepository,
    private rabbitmq: RabbitMQClient | null,
    private storage: StorageProvider,
    private scoringService: ScoringService
  ) {}

  async getByToken(token: string) {
    const checklist = await this.repository.findByToken(token);
    if (!checklist) {
      throw new NotFoundError("Checklist", token);
    }

    // 기한 만료 여부를 플래그로 반환 (조회 자체는 항상 허용)
    const isExpired = checklist.accessTokenExpiresAt
      ? new Date() > new Date(checklist.accessTokenExpiresAt)
      : false;

    return { ...checklist, isExpired };
  }

  async updateItem(token: string, itemId: string, dto: UpdateTrusteeChecklistItemInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);

    // 항목이 이 체크리스트에 속하는지 검증
    const item = await this.repository.findItemByIdAndChecklistId(itemId, checklist.id);
    if (!item) {
      throw new NotFoundError("ChecklistItem", itemId);
    }

    // 첫 저장 또는 반려 후 재작성 시 상태를 in_progress로 자동 변경
    if (checklist.status === "sent" || checklist.status === "rejected") {
      await this.repository.update(checklist.id, { status: "in_progress" });
    }

    return this.repository.updateItem(itemId, dto);
  }

  async batchUpdateItems(token: string, dto: BatchUpdateChecklistItemsInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);

    // 모든 항목이 이 체크리스트에 속하는지 검증
    for (const entry of dto.items) {
      const item = await this.repository.findItemByIdAndChecklistId(entry.id, checklist.id);
      if (!item) {
        throw new NotFoundError("ChecklistItem", entry.id);
      }
    }

    if (checklist.status === "sent" || checklist.status === "rejected") {
      await this.repository.update(checklist.id, { status: "in_progress" });
    }

    return this.repository.batchUpdateItems(dto.items);
  }

  async submit(token: string, dto: SubmitTrusteeChecklistInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);

    const newSubmissionCount = (checklist.submissionCount || 0) + 1;

    // 제출 시 스냅샷 자동 저장
    const snapshotData = this.buildSnapshotData(checklist);
    try {
      await this.repository.createSnapshot({
        checklistId: checklist.id,
        round: newSubmissionCount,
        data: snapshotData,
        submittedAt: new Date(),
      });
    } catch {
      // 중복 round인 경우 무시 (이미 스냅샷 존재)
    }

    const updated = await this.repository.update(checklist.id, {
      status: "submitted",
      submittedAt: new Date(),
      submissionCount: newSubmissionCount,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail || undefined,
      contactPhone: dto.contactPhone || undefined,
    });

    // 자동 스코어링 (update는 fullInclude로 categories 포함)
    const scoreResult = this.scoringService.calculate(updated as unknown as Parameters<typeof this.scoringService.calculate>[0]);
    await this.repository.update(checklist.id, {
      totalScore: scoreResult.totalScore,
      grade: scoreResult.grade,
      scoreDetail: JSON.parse(JSON.stringify(scoreResult)),
      scoredAt: new Date(),
    });

    await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_CREATED, {
      type: "checklist.submitted",
      data: {
        id: checklist.id,
        trusteeId: checklist.trusteeId,
        contactName: dto.contactName,
        submissionCount: updated.submissionCount,
        totalScore: scoreResult.totalScore,
        grade: scoreResult.grade,
      },
    });

    // 스코어 포함 최신 데이터 반환
    return this.repository.findById(checklist.id);
  }

  async reopen(token: string) {
    const checklist = await this.getByToken(token);

    // 기한 만료 확인
    if (checklist.isExpired) {
      throw new ForbiddenError("작성 기한이 종료되었습니다.");
    }

    // submitted 상태에서만 reopen 가능
    if (checklist.status !== "submitted") {
      throw new ForbiddenError("제출된 상태에서만 재수정이 가능합니다.");
    }

    return this.repository.update(checklist.id, {
      status: "in_progress",
    });
  }

  async uploadFiles(token: string, itemId: string, files: UploadedFile[]) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);

    // 항목이 이 체크리스트에 속하는지 확인
    const item = await this.repository.findItemByIdAndChecklistId(itemId, checklist.id);
    if (!item) {
      throw new NotFoundError("ChecklistItem", itemId);
    }

    // 최대 파일 수 확인
    const existingCount = await this.repository.countEvidenceFiles(itemId);
    if (existingCount + files.length > MAX_FILES_PER_ITEM) {
      throw new ValidationError(
        `항목당 최대 ${MAX_FILES_PER_ITEM}개의 파일만 첨부할 수 있습니다. (현재 ${existingCount}개)`
      );
    }

    // 첫 저장 또는 반려 후 재작성 시 상태 자동 변경
    if (checklist.status === "sent" || checklist.status === "rejected") {
      await this.repository.update(checklist.id, { status: "in_progress" });
    }

    const results = [];
    for (const file of files) {
      const stored = await this.storage.upload(file);
      const record = await this.repository.createEvidenceFile({
        itemId,
        fileName: stored.fileName,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        storagePath: stored.storagePath,
      });
      results.push({ ...record, url: this.storage.getUrl(stored.storagePath) });
    }

    return results;
  }

  async deleteFile(token: string, fileId: string) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);

    // 파일이 이 체크리스트에 속하는지 검증
    const file = await this.repository.findEvidenceFileByIdAndChecklistId(fileId, checklist.id);
    if (!file) {
      throw new NotFoundError("EvidenceFile", fileId);
    }

    await this.storage.delete(file.storagePath);
    await this.repository.deleteEvidenceFile(fileId);
  }

  async getFileStream(storagePath: string) {
    return this.storage.getStream(storagePath);
  }

  async getFileByPath(storagePath: string) {
    const file = await this.repository.findEvidenceFileByStoragePath(storagePath);
    const stream = await this.storage.getStream(storagePath);
    return {
      stream,
      fileName: file?.fileName,
      mimeType: file?.mimeType,
    };
  }

  async getReviews(token: string) {
    const checklist = await this.getByToken(token);
    return this.repository.findReviews(checklist.id, checklist.reviewRound || undefined);
  }

  private validateEditable(checklist: {
    status: string;
    isExpired: boolean;
  }) {
    // reviewed 상태는 항상 수정 불가
    if (checklist.status === "reviewed") {
      throw new ForbiddenError("검토가 완료된 체크리스트는 수정할 수 없습니다.");
    }

    // 기한 만료 시 수정 불가
    if (checklist.isExpired) {
      throw new ForbiddenError("작성 기한이 종료되었습니다.");
    }

    // 기한 내 + (sent | in_progress | submitted | rejected) → 수정 가능
  }

  private buildSnapshotData(checklist: {
    categories: {
      sections: {
        items: {
          id: string;
          no: string;
          question: string;
          applicable: boolean;
          answer: string | null;
          currentStatus: string | null;
          remarks: string | null;
          evidenceFiles: { fileName: string }[];
        }[];
      }[];
    }[];
  }) {
    const items: { itemId: string; no: string; question: string; applicable: boolean; answer: string | null; currentStatus: string | null; remarks: string | null; evidenceFileNames: string[] }[] = [];
    for (const cat of checklist.categories) {
      for (const sec of cat.sections) {
        for (const item of sec.items) {
          items.push({
            itemId: item.id,
            no: item.no,
            question: item.question,
            applicable: item.applicable,
            answer: item.answer,
            currentStatus: item.currentStatus,
            remarks: item.remarks,
            evidenceFileNames: item.evidenceFiles.map((f) => f.fileName),
          });
        }
      }
    }
    return items;
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
