export interface UploadedFile {
  originalname: string;
  size: number;
  mimetype: string;
  buffer: Buffer;
}

export interface StoredFileInfo {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(file: UploadedFile): Promise<StoredFileInfo>;
  delete(storagePath: string): Promise<void>;
  getUrl(storagePath: string): string;
  getStream(storagePath: string): Promise<NodeJS.ReadableStream>;
}
