import { Prisma } from "../generated/prisma";

import { prisma } from "../db";

interface CreateContactData {
  name: string;
  phone?: string;
  email?: string;
  department?: string;
  position?: string;
  isPrimary: boolean;
}

interface UpdateContactData extends Partial<CreateContactData> {
  id?: string;
}

const TRUSTEE_INCLUDE = { contacts: true, contracts: true };

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
        include: TRUSTEE_INCLUDE,
      }),
      prisma.trustee.count({ where: params.where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return prisma.trustee.findUnique({
      where: { id },
      include: TRUSTEE_INCLUDE,
    });
  }

  async findByBusinessNumber(businessNumber: string) {
    if (!businessNumber) return null;
    return prisma.trustee.findUnique({
      where: { businessNumber },
    });
  }

  async create(data: {
    companyName: string;
    businessNumber?: string;
    representative?: string;
    delegatedTasks: string;
    status?: "active" | "inactive" | "pending";
    contacts: CreateContactData[];
  }) {
    const { contacts, ...trusteeData } = data;
    return prisma.trustee.create({
      data: {
        ...trusteeData,
        contacts: { create: contacts },
      },
      include: TRUSTEE_INCLUDE,
    });
  }

  async update(
    id: string,
    data: {
      companyName?: string;
      businessNumber?: string;
      representative?: string;
      delegatedTasks?: string;
      status?: "active" | "inactive" | "pending";
      contacts?: UpdateContactData[];
    }
  ) {
    const { contacts, ...trusteeData } = data;

    return prisma.$transaction(async (tx) => {
      if (contacts) {
        await tx.trusteeContact.deleteMany({ where: { trusteeId: id } });
        await tx.trusteeContact.createMany({
          data: contacts.map((c) => ({
            trusteeId: id,
            name: c.name!,
            phone: c.phone,
            email: c.email,
            department: c.department,
            position: c.position,
            isPrimary: c.isPrimary ?? false,
          })),
        });
      }

      return tx.trustee.update({
        where: { id },
        data: trusteeData,
        include: TRUSTEE_INCLUDE,
      });
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
