import { Request, Response, NextFunction } from "express";

import { ChecklistResponseService } from "../services/checklist-response.service";
import type { UploadedFile } from "../storage";

export class ChecklistResponseController {
  constructor(private service: ChecklistResponseService) {}

  getByToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const checklist = await this.service.getByToken(req.params.token as string);
      // accessToken은 응답에서 제외 (보안)
      const { accessToken: _token, ...data } = checklist as Record<string, unknown>;
      res.json({ data });
    } catch (error) {
      next(error);
    }
  };

  updateItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await this.service.updateItem(
        req.params.token as string,
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
      const items = await this.service.batchUpdateItems(
        req.params.token as string,
        req.body
      );
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const checklist = await this.service.submit(
        req.params.token as string,
        req.body
      );
      res.json({ data: checklist });
    } catch (error) {
      next(error);
    }
  };

  reopen = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.reopen(req.params.token as string);
      const { accessToken: _token, ...data } = result as Record<string, unknown>;
      res.json({ data });
    } catch (error) {
      next(error);
    }
  };

  uploadFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      const uploadedFiles: UploadedFile[] = files.map((f) => ({
        originalname: Buffer.from(f.originalname, "latin1").toString("utf8"),
        size: f.size,
        mimetype: f.mimetype,
        buffer: f.buffer,
      }));

      const results = await this.service.uploadFiles(
        req.params.token as string,
        req.params.itemId as string,
        uploadedFiles
      );
      res.status(201).json({ data: results });
    } catch (error) {
      next(error);
    }
  };

  deleteFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.deleteFile(
        req.params.token as string,
        req.params.fileId as string
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  getReviews = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getReviews(req.params.token as string);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  downloadFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storagePath = req.params[0] as string;
      const { stream, fileName, mimeType } = await this.service.getFileByPath(storagePath);

      if (mimeType) {
        res.setHeader("Content-Type", mimeType);
      }
      if (fileName) {
        const encoded = encodeURIComponent(fileName);
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`
        );
      }

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}
