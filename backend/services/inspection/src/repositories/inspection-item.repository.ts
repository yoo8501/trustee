import { Prisma } from "../generated/prisma";

import { prisma } from "../db";

export class InspectionItemRepository {
  async findByInspectionId(inspectionId: string) {
    return prisma.inspectionItem.findMany({
      where: { inspectionId },
      orderBy: { category: "asc" },
    });
  }

  async findById(id: string) {
    return prisma.inspectionItem.findUnique({
      where: { id },
    });
  }

  async create(data: Prisma.InspectionItemCreateInput) {
    return prisma.inspectionItem.create({ data });
  }

  async createMany(inspectionId: string, items: Array<{
    category: string;
    question: string;
    result: "pass" | "fail" | "partial" | "not_applicable";
    note?: string;
  }>) {
    return prisma.inspectionItem.createMany({
      data: items.map((item) => ({
        inspectionId,
        ...item,
      })),
    });
  }

  async update(id: string, data: Prisma.InspectionItemUpdateInput) {
    return prisma.inspectionItem.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return prisma.inspectionItem.delete({
      where: { id },
    });
  }
}
