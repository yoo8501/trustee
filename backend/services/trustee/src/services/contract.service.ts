import { NotFoundError } from "@trustee/common";

import { ContractRepository, TrusteeRepository } from "../repositories";

interface CreateContractDto {
  trusteeId: string;
  startDate: string;
  endDate: string;
  fileUrl?: string;
}

type UpdateContractDto = Partial<Omit<CreateContractDto, "trusteeId">>;

export class ContractService {
  constructor(
    private contractRepository: ContractRepository,
    private trusteeRepository: TrusteeRepository
  ) {}

  async listByTrustee(trusteeId: string) {
    const exists = await this.trusteeRepository.exists(trusteeId);
    if (!exists) {
      throw new NotFoundError("Trustee", trusteeId);
    }
    return this.contractRepository.findByTrusteeId(trusteeId);
  }

  async getById(id: string) {
    const contract = await this.contractRepository.findById(id);
    if (!contract) {
      throw new NotFoundError("Contract", id);
    }
    return contract;
  }

  async create(dto: CreateContractDto) {
    const trusteeExists = await this.trusteeRepository.exists(dto.trusteeId);
    if (!trusteeExists) {
      throw new NotFoundError("Trustee", dto.trusteeId);
    }

    return this.contractRepository.create({
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      fileUrl: dto.fileUrl,
      trustee: { connect: { id: dto.trusteeId } },
    });
  }

  async update(id: string, dto: UpdateContractDto) {
    const existing = await this.contractRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Contract", id);
    }

    return this.contractRepository.update(id, {
      ...(dto.startDate && { startDate: new Date(dto.startDate) }),
      ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      ...(dto.fileUrl !== undefined && { fileUrl: dto.fileUrl }),
    });
  }

  async delete(id: string) {
    const existing = await this.contractRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Contract", id);
    }
    await this.contractRepository.delete(id);
  }
}
