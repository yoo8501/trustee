import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

import type { StorageProvider, UploadedFile, StoredFileInfo } from "./storage.interface";

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.resolve(process.cwd(), "uploads", "evidence");
  }

  private resolveSafePath(storagePath: string): string {
    const fullPath = path.resolve(this.basePath, storagePath);
    if (!fullPath.startsWith(this.basePath + path.sep) && fullPath !== this.basePath) {
      throw new Error("잘못된 파일 경로입니다.");
    }
    return fullPath;
  }

  async upload(file: UploadedFile): Promise<StoredFileInfo> {
    await fs.mkdir(this.basePath, { recursive: true });

    const ext = path.extname(file.originalname);
    const storageName = `${randomUUID()}${ext}`;
    const storagePath = path.join(storageName);
    const fullPath = path.join(this.basePath, storageName);

    await fs.writeFile(fullPath, file.buffer);

    return {
      storagePath,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = this.resolveSafePath(storagePath);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  getUrl(storagePath: string): string {
    return `/api/checklist-response/files/${storagePath}`;
  }

  async getStream(storagePath: string): Promise<NodeJS.ReadableStream> {
    const fullPath = this.resolveSafePath(storagePath);
    await fs.access(fullPath);
    return createReadStream(fullPath);
  }
}
