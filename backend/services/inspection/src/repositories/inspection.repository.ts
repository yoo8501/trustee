import { Prisma } from "../generated/prisma";

import { prisma } from "../db";

export class InspectionRepository {
  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.InspectionWhereInput;
    orderBy?: Prisma.InspectionOrderByWithRelationInput;
  }) {
    const [data, total] = await Promise.all([
      prisma.inspection.findMany({
        skip: params.skip,
        take: params.take,
        where: params.where,
        orderBy: params.orderBy,
        include: { items: true },
      }),
      prisma.inspection.count({ where: params.where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return prisma.inspection.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  async findByTrusteeId(trusteeId: string) {
    return prisma.inspection.findMany({
      where: { trusteeId },
      include: { items: true },
      orderBy: { inspectionDate: "desc" },
    });
  }

  async findLatestByTrusteeId(trusteeId: string) {
    return prisma.inspection.findFirst({
      where: { trusteeId },
      orderBy: { inspectionDate: "desc" },
      include: { items: true },
    });
  }

  async create(data: Prisma.InspectionCreateInput) {
    return prisma.inspection.create({
      data,
      include: { items: true },
    });
  }

  async update(id: string, data: Prisma.InspectionUpdateInput) {
    return prisma.inspection.update({
      where: { id },
      data,
      include: { items: true },
    });
  }

  async delete(id: string) {
    return prisma.inspection.delete({
      where: { id },
    });
  }

  async cancelByTrusteeId(trusteeId: string) {
    return prisma.inspection.updateMany({
      where: {
        trusteeId,
        status: { in: ["scheduled", "in_progress"] },
      },
      data: { status: "cancelled" },
    });
  }
}
