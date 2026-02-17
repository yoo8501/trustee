import { Prisma } from "../generated/prisma";

import { prisma } from "../db";

export class TrusteeRepository {
  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.TrusteeWhereInput;
    orderBy?: Prisma.TrusteeOrderByWithRelationInput;
  }) {
    const [data, total] = await Promise.all([
      prisma.trustee.findMany({
        skip: params.skip,
        take: params.take,
        where: params.where,
        orderBy: params.orderBy,
        include: { contracts: true },
      }),
      prisma.trustee.count({ where: params.where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return prisma.trustee.findUnique({
      where: { id },
      include: { contracts: true },
    });
  }

  async findByBusinessNumber(businessNumber: string) {
    return prisma.trustee.findUnique({
      where: { businessNumber },
    });
  }

  async create(data: Prisma.TrusteeCreateInput) {
    return prisma.trustee.create({
      data,
      include: { contracts: true },
    });
  }

  async update(id: string, data: Prisma.TrusteeUpdateInput) {
    return prisma.trustee.update({
      where: { id },
      data,
      include: { contracts: true },
    });
  }

  async delete(id: string) {
    return prisma.trustee.delete({
      where: { id },
    });
  }

  async exists(id: string): Promise<boolean> {
    const count = await prisma.trustee.count({ where: { id } });
    return count > 0;
  }
}
