import { Request, Response, NextFunction } from "express";

import { InspectionItemService } from "../services";

export class InspectionItemController {
  constructor(private service: InspectionItemService) {}

  listByInspection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await this.service.listByInspection(req.params.inspectionId as string);
      res.json({ data: items, total: items.length });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.service.getById(req.params.id as string);
      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.service.create(req.body);
      res.status(201).json({ data: item });
    } catch (error) {
      next(error);
    }
  };

  createBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createBatch(
        req.params.inspectionId as string,
        req.body.items
      );
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.service.update(req.params.id as string, req.body);
      res.json({ data: item });
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
