import { Request, Response, NextFunction } from "express";

import { TrusteeChecklistService } from "../services";

export class TrusteeChecklistController {
  constructor(private service: TrusteeChecklistService) {}

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
      const checklist = await this.service.getById(req.params.id as string);
      res.json({ data: checklist });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const checklist = await this.service.create(req.body);
      res.status(201).json({ data: checklist });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const checklist = await this.service.update(req.params.id as string, req.body);
      res.json({ data: checklist });
    } catch (error) {
      next(error);
    }
  };

  updateItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.service.updateItem(
        req.params.id as string,
        req.params.itemId as string,
        req.body
      );
      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  };

  batchUpdateItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await this.service.batchUpdateItems(req.params.id as string, req.body);
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  };

  regenerateToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.regenerateToken(req.params.id as string);
      res.json({ data: { accessToken: result.accessToken } });
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
