import type { CreateChecklistTemplateInput, UpdateChecklistTemplateInput } from "@trustee/types";

import { prisma } from "../db";

const fullInclude = {
  categories: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          items: { orderBy: { sortOrder: "asc" as const } },
        },
      },
    },
  },
};

export class ChecklistTemplateRepository {
  async findAll(params: { skip?: number; take?: number }) {
    const [data, total] = await Promise.all([
      prisma.checklistTemplate.findMany({
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, no: true, name: true },
          },
        },
      }),
      prisma.checklistTemplate.count(),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return prisma.checklistTemplate.findUnique({
      where: { id },
      include: fullInclude,
    });
  }

  async create(data: CreateChecklistTemplateInput) {
    return prisma.checklistTemplate.create({
      data: {
        title: data.title,
        version: data.version || "1.0",
        description: data.description,
        categories: {
          create: data.categories.map((cat, ci) => ({
            no: cat.no,
            name: cat.name,
            sortOrder: ci,
            sections: {
              create: cat.sections.map((sec, si) => ({
                no: sec.no,
                name: sec.name,
                sortOrder: si,
                items: {
                  create: sec.items.map((item, ii) => ({
                    no: item.no,
                    question: item.question,
                    hint: item.hint,
                    sortOrder: ii,
                  })),
                },
              })),
            },
          })),
        },
      },
      include: fullInclude,
    });
  }

  async update(id: string, data: UpdateChecklistTemplateInput) {
    return prisma.checklistTemplate.update({
      where: { id },
      data,
      include: fullInclude,
    });
  }

  async delete(id: string) {
    return prisma.checklistTemplate.delete({
      where: { id },
    });
  }
}
