import { Router } from "express";
import { validate } from "@trustee/common";

import { ChecklistResponseController } from "../controllers/checklist-response.controller";
import {
  updateTrusteeChecklistItemSchema,
  batchUpdateChecklistItemsSchema,
  submitChecklistSchema,
} from "../validation";
import { uploadEvidence } from "../middleware/upload";

export function createChecklistResponseRoutes(
  controller: ChecklistResponseController
): Router {
  const router = Router();

  // 파일 다운로드 (인증 불필요)
  router.get("/files/*", controller.downloadFile);

  router.get("/:token", controller.getByToken);
  router.patch(
    "/:token/items/:itemId",
    validate(updateTrusteeChecklistItemSchema),
    controller.updateItem
  );
  router.patch(
    "/:token/items/batch",
    validate(batchUpdateChecklistItemsSchema),
    controller.batchUpdateItems
  );

  // 파일 업로드/삭제
  router.post("/:token/items/:itemId/files", uploadEvidence, controller.uploadFiles);
  router.delete("/:token/files/:fileId", controller.deleteFile);

  router.post(
    "/:token/submit",
    validate(submitChecklistSchema),
    controller.submit
  );
  router.post("/:token/reopen", controller.reopen);

  return router;
}
