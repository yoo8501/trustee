import { randomUUID } from "crypto";
import type {
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
} from "@trustee/types";
import { Prisma } from "../generated/prisma";

import { prisma } from "../db";

const fullInclude = {
  categories: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          items: {
            orderBy: { sortOrder: "asc" as const },
            include: { evidenceFiles: { orderBy: { createdAt: "asc" as const } } },
          },
        },
      },
    },
  },
};

// Root 템플릿의 전체 트리 타입
interface FullChecklistTemplate {
  id: string;
  title: string;
  version: string;
  categories: {
    no: number;
    name: string;
    sortOrder: number;
    weight: number;
    sections: {
      no: string;
      name: string;
      sortOrder: number;
      items: {
        no: string;
        question: string;
        hint: string | null;
        sortOrder: number;
        isCritical: boolean;
      }[];
    }[];
  }[];
}

export class TrusteeChecklistRepository {
  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.TrusteeChecklistWhereInput;
  }) {
    const [data, total] = await Promise.all([
      prisma.trusteeChecklist.findMany({
        skip: params.skip,
        take: params.take,
        where: params.where,
        orderBy: { createdAt: "desc" },
      }),
      prisma.trusteeChecklist.count({ where: params.where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return prisma.trusteeChecklist.findUnique({
      where: { id },
      include: fullInclude,
    });
  }

  async createFromTemplate(params: {
    trusteeId: string;
    template: FullChecklistTemplate;
    inspectionScope?: string;
    accessTokenExpiresAt: Date;
  }) {
    // 전체 항목 수 계산
    let totalItemCount = 0;
    for (const cat of params.template.categories) {
      for (const sec of cat.sections) {
        totalItemCount += sec.items.length;
      }
    }

    return prisma.$transaction(async (tx) => {
      const checklist = await tx.trusteeChecklist.create({
        data: {
          trusteeId: params.trusteeId,
          templateId: params.template.id,
          templateVersion: params.template.version,
          title: params.template.title,
          inspectionScope: params.inspectionScope,
          accessTokenExpiresAt: params.accessTokenExpiresAt,
          status: "draft",
          totalItemCount,
          answeredCount: 0,
          categories: {
            create: params.template.categories.map((cat) => ({
              no: cat.no,
              name: cat.name,
              sortOrder: cat.sortOrder,
              weight: cat.weight || 0,
              sections: {
                create: cat.sections.map((sec) => ({
                  no: sec.no,
                  name: sec.name,
                  sortOrder: sec.sortOrder,
                  items: {
                    create: sec.items.map((item) => ({
                      no: item.no,
                      question: item.question,
                      hint: item.hint,
                      sortOrder: item.sortOrder,
                      applicable: true,
                      answer: null,
                      currentStatus: null,
                      remarks: null,
                      isCritical: item.isCritical || false,
                    })),
                  },
                })),
              },
            })),
          },
        },
        include: fullInclude,
      });
      return checklist;
    });
  }

  async update(
    id: string,
    data: UpdateTrusteeChecklistInput & {
      submittedAt?: Date;
      submissionCount?: number;
      accessTokenExpiresAt?: Date;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      totalScore?: number;
      grade?: string;
      scoreDetail?: Prisma.InputJsonValue;
      scoredAt?: Date;
      totalItemCount?: number;
      answeredCount?: number;
      reviewRound?: number;
    }
  ) {
    return prisma.trusteeChecklist.update({
      where: { id },
      data,
      include: fullInclude,
    });
  }

  async updateItem(itemId: string, data: UpdateTrusteeChecklistItemInput) {
    return prisma.trusteeChecklistItem.update({
      where: { id: itemId },
      data,
    });
  }

  async batchUpdateItems(items: BatchUpdateChecklistItemsInput["items"]) {
    return prisma.$transaction(
      items.map((item) =>
        prisma.trusteeChecklistItem.update({
          where: { id: item.id },
          data: {
            applicable: item.applicable,
            answer: item.answer,
            currentStatus: item.currentStatus,
            remarks: item.remarks,
          },
        })
      )
    );
  }

  async findItemById(itemId: string) {
    return prisma.trusteeChecklistItem.findUnique({
      where: { id: itemId },
      include: { evidenceFiles: true },
    });
  }

  async findItemByIdAndChecklistId(itemId: string, checklistId: string) {
    return prisma.trusteeChecklistItem.findFirst({
      where: {
        id: itemId,
        section: { category: { checklistId } },
      },
      include: { evidenceFiles: true },
    });
  }

  async findEvidenceFileByIdAndChecklistId(fileId: string, checklistId: string) {
    return prisma.evidenceFile.findFirst({
      where: {
        id: fileId,
        item: { section: { category: { checklistId } } },
      },
    });
  }

  async createEvidenceFile(data: {
    itemId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    storagePath: string;
  }) {
    return prisma.evidenceFile.create({ data });
  }

  async findEvidenceFileById(fileId: string) {
    return prisma.evidenceFile.findUnique({ where: { id: fileId } });
  }

  async deleteEvidenceFile(fileId: string) {
    return prisma.evidenceFile.delete({ where: { id: fileId } });
  }

  async countEvidenceFiles(itemId: string) {
    return prisma.evidenceFile.count({ where: { itemId } });
  }

  async findEvidenceFileByStoragePath(storagePath: string) {
    return prisma.evidenceFile.findFirst({ where: { storagePath } });
  }

  async findByToken(token: string) {
    return prisma.trusteeChecklist.findUnique({
      where: { accessToken: token },
      include: fullInclude,
    });
  }

  async regenerateToken(id: string) {
    return prisma.trusteeChecklist.update({
      where: { id },
      data: { accessToken: randomUUID() },
    });
  }

  async delete(id: string) {
    return prisma.trusteeChecklist.delete({
      where: { id },
    });
  }

  // ── 스코어링 ──

  async getStats() {
    const [total, submitted, reviewed, scores] = await Promise.all([
      prisma.trusteeChecklist.count(),
      prisma.trusteeChecklist.count({ where: { status: "submitted" } }),
      prisma.trusteeChecklist.count({ where: { status: "reviewed" } }),
      prisma.trusteeChecklist.aggregate({
        _avg: { totalScore: true },
        where: { totalScore: { not: null } },
      }),
    ]);

    return {
      total,
      submitted,
      reviewed,
      averageScore: scores._avg.totalScore
        ? Math.round(scores._avg.totalScore * 10) / 10
        : null,
    };
  }

  async findRecentSubmitted(limit: number) {
    return prisma.trusteeChecklist.findMany({
      where: {
        status: { in: ["submitted", "reviewed"] },
      },
      orderBy: { submittedAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        trusteeId: true,
        status: true,
        totalScore: true,
        grade: true,
        submittedAt: true,
      },
    });
  }

  // ── 검토/반려 ──

  async reject(params: {
    checklistId: string;
    items: { itemId: string; status: string; reason?: string }[];
    reviewRound: number;
    newDeadline: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.itemReview.createMany({
        data: params.items.map((item) => ({
          checklistId: params.checklistId,
          itemId: item.itemId,
          status: item.status,
          reason: item.reason || null,
          reviewRound: params.reviewRound,
        })),
      });

      return tx.trusteeChecklist.update({
        where: { id: params.checklistId },
        data: {
          status: "rejected",
          reviewRound: params.reviewRound,
          accessTokenExpiresAt: params.newDeadline,
        },
        include: fullInclude,
      });
    });
  }

  async createSnapshot(params: {
    checklistId: string;
    round: number;
    data: unknown;
    submittedAt: Date;
  }) {
    return prisma.checklistSnapshot.create({
      data: {
        checklistId: params.checklistId,
        round: params.round,
        data: params.data as Prisma.InputJsonValue,
        submittedAt: params.submittedAt,
      },
    });
  }

  async findSnapshot(checklistId: string, round: number) {
    return prisma.checklistSnapshot.findUnique({
      where: { checklistId_round: { checklistId, round } },
    });
  }

  async findSnapshots(checklistId: string) {
    return prisma.checklistSnapshot.findMany({
      where: { checklistId },
      orderBy: { round: "asc" },
    });
  }

  async findSnapshotsMeta(checklistId: string) {
    return prisma.checklistSnapshot.findMany({
      where: { checklistId },
      orderBy: { round: "asc" },
      select: {
        id: true,
        checklistId: true,
        round: true,
        submittedAt: true,
      },
    });
  }

  async findReviews(checklistId: string, reviewRound?: number) {
    return prisma.itemReview.findMany({
      where: {
        checklistId,
        ...(reviewRound !== undefined ? { reviewRound } : {}),
      },
      orderBy: { reviewedAt: "desc" },
    });
  }
}
