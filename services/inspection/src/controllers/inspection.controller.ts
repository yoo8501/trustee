import { Request, Response, NextFunction } from "express";

import { InspectionService } from "../services";

export class InspectionController {
  constructor(private service: InspectionService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, trusteeId, status } = req.query;
      const result = await this.service.list({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        trusteeId: trusteeId as string,
        status: status as string,
      });
      res.json({ data: result.data, total: result.total });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await this.service.getById(req.params.id as string);
      res.json({ data: inspection });
    } catch (error) {
      next(error);
    }
  };

  getByTrusteeId = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspections = await this.service.getByTrusteeId(req.params.trusteeId as string);
      res.json({ data: inspections, total: inspections.length });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await this.service.create(req.body);
      res.status(201).json({ data: inspection });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inspection = await this.service.update(req.params.id as string, req.body);
      res.json({ data: inspection });
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
