import { Router } from "express";
import { validate } from "@trustee/common";

import { TrusteeChecklistController } from "../controllers";
import {
  createTrusteeChecklistSchema,
  updateTrusteeChecklistSchema,
  updateTrusteeChecklistItemSchema,
  batchUpdateChecklistItemsSchema,
} from "../validation";

export function createTrusteeChecklistRoutes(controller: TrusteeChecklistController): Router {
  const router = Router();

  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", validate(createTrusteeChecklistSchema), controller.create);
  router.patch("/:id", validate(updateTrusteeChecklistSchema), controller.update);
  router.patch("/:id/items/batch", validate(batchUpdateChecklistItemsSchema), controller.batchUpdateItems);
  router.patch("/:id/items/:itemId", validate(updateTrusteeChecklistItemSchema), controller.updateItem);
  router.post("/:id/regenerate-token", controller.regenerateToken);
  router.delete("/:id", controller.delete);

  return router;
}
