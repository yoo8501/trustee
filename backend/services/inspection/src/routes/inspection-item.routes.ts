import { Router } from "express";
import { validate } from "@trustee/common";

import { InspectionItemController } from "../controllers";
import {
  createInspectionItemSchema,
  updateInspectionItemSchema,
  batchCreateInspectionItemsSchema,
} from "../validation";

export function createInspectionItemRoutes(
  controller: InspectionItemController
): Router {
  const router = Router();

  router.get("/inspection/:inspectionId", controller.listByInspection);
  router.get("/:id", controller.getById);
  router.post("/", validate(createInspectionItemSchema), controller.create);
  router.post(
    "/inspection/:inspectionId/batch",
    validate(batchCreateInspectionItemsSchema),
    controller.createBatch
  );
  router.patch("/:id", validate(updateInspectionItemSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
