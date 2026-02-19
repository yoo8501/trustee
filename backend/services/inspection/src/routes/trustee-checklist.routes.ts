import { Router } from "express";
import { validate } from "@trustee/common";

import { TrusteeChecklistController } from "../controllers";
import {
  createTrusteeChecklistSchema,
  updateTrusteeChecklistSchema,
  updateTrusteeChecklistItemSchema,
  batchUpdateChecklistItemsSchema,
  rejectChecklistSchema,
} from "../validation";

export function createTrusteeChecklistRoutes(controller: TrusteeChecklistController): Router {
  const router = Router();

  router.get("/stats/summary", controller.stats);
  router.get("/recent/submitted", controller.recentSubmitted);
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", validate(createTrusteeChecklistSchema), controller.create);
  router.patch("/:id", validate(updateTrusteeChecklistSchema), controller.update);
  router.patch("/:id/items/batch", validate(batchUpdateChecklistItemsSchema), controller.batchUpdateItems);
  router.patch("/:id/items/:itemId", validate(updateTrusteeChecklistItemSchema), controller.updateItem);
  router.post("/:id/score", controller.score);
  router.post("/:id/reject", validate(rejectChecklistSchema), controller.reject);
  router.post("/:id/review", controller.review);
  router.get("/:id/snapshots", controller.getSnapshots);
  router.get("/:id/diff", controller.getDiff);
  router.get("/:id/reviews", controller.getReviews);
  router.post("/:id/regenerate-token", controller.regenerateToken);
  router.delete("/:id", controller.delete);

  return router;
}
