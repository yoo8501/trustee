import { Request, Response, NextFunction } from "express";

import { ContractService } from "../services";

export class ContractController {
  constructor(private service: ContractService) {}

  listByTrustee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contracts = await this.service.listByTrustee(req.params.trusteeId as string);
      res.json({ data: contracts, total: contracts.length });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contract = await this.service.getById(req.params.id as string);
      res.json({ data: contract });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contract = await this.service.create(req.body);
      res.status(201).json({ data: contract });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contract = await this.service.update(req.params.id as string, req.body);
      res.json({ data: contract });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.delete(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
