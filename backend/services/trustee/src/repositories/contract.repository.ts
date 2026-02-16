import { Prisma } from "../generated/prisma";

import { prisma } from "../db";

export class ContractRepository {
  async findByTrusteeId(trusteeId: string) {
    return prisma.contract.findMany({
      where: { trusteeId },
      orderBy: { startDate: "desc" },
    });
  }

  async findById(id: string) {
    return prisma.contract.findUnique({
      where: { id },
    });
  }

  async create(data: Prisma.ContractCreateInput) {
    return prisma.contract.create({ data });
  }

  async update(id: string, data: Prisma.ContractUpdateInput) {
    return prisma.contract.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return prisma.contract.delete({
      where: { id },
    });
  }

  async countByTrusteeId(trusteeId: string): Promise<number> {
    return prisma.contract.count({ where: { trusteeId } });
  }
}
