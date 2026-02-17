import { Request, Response, NextFunction } from "express";

import { TrusteeService } from "../services";

export class TrusteeController {
  constructor(private service: TrusteeService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, search, status } = req.query;
      const result = await this.service.list({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search as string,
        status: status as string,
      });
      res.json({ data: result.data, total: result.total });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trustee = await this.service.getById(req.params.id as string);
      res.json({ data: trustee });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trustee = await this.service.create(req.body);
      res.status(201).json({ data: trustee });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trustee = await this.service.update(req.params.id as string, req.body);
      res.json({ data: trustee });
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
