import { NotFoundError } from "@trustee/common";

import { InspectionItemRepository, InspectionRepository } from "../repositories";

interface CreateInspectionItemDto {
  inspectionId: string;
  category: string;
  question: string;
  result: "pass" | "fail" | "partial" | "not_applicable";
  note?: string;
}

interface UpdateInspectionItemDto {
  category?: string;
  question?: string;
  result?: "pass" | "fail" | "partial" | "not_applicable";
  note?: string;
}

export class InspectionItemService {
  constructor(
    private itemRepository: InspectionItemRepository,
    private inspectionRepository: InspectionRepository
  ) {}

  async listByInspection(inspectionId: string) {
    const inspection = await this.inspectionRepository.findById(inspectionId);
    if (!inspection) {
      throw new NotFoundError("Inspection", inspectionId);
    }
    return this.itemRepository.findByInspectionId(inspectionId);
  }

  async getById(id: string) {
    const item = await this.itemRepository.findById(id);
    if (!item) {
      throw new NotFoundError("InspectionItem", id);
    }
    return item;
  }

  async create(dto: CreateInspectionItemDto) {
    const inspection = await this.inspectionRepository.findById(dto.inspectionId);
    if (!inspection) {
      throw new NotFoundError("Inspection", dto.inspectionId);
    }

    return this.itemRepository.create({
      category: dto.category,
      question: dto.question,
      result: dto.result,
      note: dto.note,
      inspection: { connect: { id: dto.inspectionId } },
    });
  }

  async createBatch(inspectionId: string, items: Array<Omit<CreateInspectionItemDto, "inspectionId">>) {
    const inspection = await this.inspectionRepository.findById(inspectionId);
    if (!inspection) {
      throw new NotFoundError("Inspection", inspectionId);
    }

    return this.itemRepository.createMany(inspectionId, items);
  }

  async update(id: string, dto: UpdateInspectionItemDto) {
    const existing = await this.itemRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("InspectionItem", id);
    }
    return this.itemRepository.update(id, dto);
  }

  async delete(id: string) {
    const existing = await this.itemRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("InspectionItem", id);
    }
    await this.itemRepository.delete(id);
  }
}
