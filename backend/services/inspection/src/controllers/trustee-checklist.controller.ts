import { Request, Response, NextFunction } from "express";

import { TrusteeChecklistService } from "../services";

export class TrusteeChecklistController {
  constructor(private service: TrusteeChecklistService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, trusteeId, status, search } = req.query;
      const result = await this.service.list({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        trusteeId: trusteeId as string,
        status: status as string,
        search: search as string,
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

  score = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.score(req.params.id as string);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  stats = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await this.service.getStats();
      res.json({ data: stats });
    } catch (error) {
      next(error);
    }
  };

  recentSubmitted = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 5;
      const data = await this.service.getRecentSubmitted(limit);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.reject(req.params.id as string, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  review = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.review(req.params.id as string);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  getSnapshots = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const snapshots = await this.service.getSnapshots(req.params.id as string);
      res.json({ data: snapshots });
    } catch (error) {
      next(error);
    }
  };

  getDiff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const round = req.query.round ? Number(req.query.round) : undefined;
      const result = await this.service.getDiff(req.params.id as string, round);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  getReviews = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const round = req.query.round ? Number(req.query.round) : undefined;
      const result = await this.service.getReviews(req.params.id as string, round);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
