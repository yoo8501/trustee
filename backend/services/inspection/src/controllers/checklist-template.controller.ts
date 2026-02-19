import { Request, Response, NextFunction } from "express";

import { ChecklistTemplateService } from "../services";

export class ChecklistTemplateController {
  constructor(private service: ChecklistTemplateService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query;
      const result = await this.service.list({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json({ data: result.data, total: result.total });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await this.service.getById(req.params.id as string);
      res.json({ data: template });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await this.service.create(req.body);
      res.status(201).json({ data: template });
    } catch (error) {
      next(error);
    }
  };

  importFromJson = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await this.service.importFromJson(req.body.jsonData);
      res.status(201).json({ data: template });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await this.service.update(req.params.id as string, req.body);
      res.json({ data: template });
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
