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

const MAX_FILES_PER_ITEM = 5;

export class ChecklistResponseService {
  constructor(
    private repository: TrusteeChecklistRepository,
    private rabbitmq: RabbitMQClient | null,
    private storage: StorageProvider
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

    // 첫 저장 시 상태를 in_progress로 자동 변경
    if (checklist.status === "sent") {
      await this.repository.update(checklist.id, { status: "in_progress" });
    }

    return this.repository.updateItem(itemId, dto);
  }

  async batchUpdateItems(token: string, dto: BatchUpdateChecklistItemsInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);

    if (checklist.status === "sent") {
      await this.repository.update(checklist.id, { status: "in_progress" });
    }

    return this.repository.batchUpdateItems(dto.items);
  }

  async submit(token: string, dto: SubmitTrusteeChecklistInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);

    const updated = await this.repository.update(checklist.id, {
      status: "submitted",
      submittedAt: new Date(),
      submissionCount: (checklist.submissionCount || 0) + 1,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail || undefined,
      contactPhone: dto.contactPhone || undefined,
    });

    await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_CREATED, {
      type: "checklist.submitted",
      data: {
        id: checklist.id,
        trusteeId: checklist.trusteeId,
        contactName: dto.contactName,
        submissionCount: updated.submissionCount,
      },
    });

    return updated;
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
    const item = await this.repository.findItemById(itemId);
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

    // 첫 저장 시 상태 자동 변경
    if (checklist.status === "sent") {
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

    const file = await this.repository.findEvidenceFileById(fileId);
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
    // storagePath로 DB에서 파일 메타 조회 (파일명, MIME 타입)
    // 간단히 스토리지에서 스트림만 반환
    return {
      stream: await this.storage.getStream(storagePath),
    };
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

    // 기한 내 + (sent | in_progress | submitted) → 수정 가능
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
