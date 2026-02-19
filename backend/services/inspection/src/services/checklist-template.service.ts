import { NotFoundError } from "@trustee/common";
import type { CreateChecklistTemplateInput, UpdateChecklistTemplateInput } from "@trustee/types";

import { ChecklistTemplateRepository } from "../repositories";

interface ListParams {
  page?: number;
  limit?: number;
}

// JSON 파일에서 Import 시 사용되는 구조
interface JsonTemplateCategory {
  no: number;
  "범주"?: string;
  name?: string;
  sections: {
    no: string;
    "영역"?: string;
    name?: string;
    items: {
      no: string;
      "통제항목"?: string;
      question?: string;
      "비고사항"?: string;
      hint?: string;
    }[];
  }[];
}

interface JsonTemplateData {
  title?: string;
  version?: string;
  description?: string;
  categories: JsonTemplateCategory[];
}

export class ChecklistTemplateService {
  constructor(private repository: ChecklistTemplateRepository) {}

  async list(params: ListParams) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    return this.repository.findAll({ skip, take: limit });
  }

  async getById(id: string) {
    const template = await this.repository.findById(id);
    if (!template) {
      throw new NotFoundError("ChecklistTemplate", id);
    }
    return template;
  }

  async create(dto: CreateChecklistTemplateInput) {
    return this.repository.create(dto);
  }

  async importFromJson(jsonData: JsonTemplateData) {
    const input: CreateChecklistTemplateInput = {
      title: jsonData.title || "보안점검 체크리스트",
      version: jsonData.version || "1.0",
      description: jsonData.description,
      categories: jsonData.categories.map((cat) => ({
        no: cat.no,
        name: cat["범주"] || cat.name || "",
        sections: cat.sections.map((sec) => ({
          no: sec.no,
          name: sec["영역"] || sec.name || "",
          items: sec.items.map((item) => ({
            no: item.no,
            question: item["통제항목"] || item.question || "",
            hint: item["비고사항"] || item.hint,
          })),
        })),
      })),
    };
    return this.repository.create(input);
  }

  async update(id: string, dto: UpdateChecklistTemplateInput) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("ChecklistTemplate", id);
    }
    return this.repository.update(id, dto);
  }

  async delete(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("ChecklistTemplate", id);
    }
    await this.repository.delete(id);
  }
}
