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
    sections: {
      no: string;
      name: string;
      sortOrder: number;
      items: {
        no: string;
        question: string;
        hint: string | null;
        sortOrder: number;
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
          categories: {
            create: params.template.categories.map((cat) => ({
              no: cat.no,
              name: cat.name,
              sortOrder: cat.sortOrder,
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
}
