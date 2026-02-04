import { Router } from "express";
import { validate } from "@trustee/common";

import { InspectionController } from "../controllers";
import { createInspectionSchema, updateInspectionSchema } from "../validation";

export function createInspectionRoutes(controller: InspectionController): Router {
  const router = Router();

  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.get("/trustee/:trusteeId", controller.getByTrusteeId);
  router.post("/", validate(createInspectionSchema), controller.create);
  router.patch("/:id", validate(updateInspectionSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
