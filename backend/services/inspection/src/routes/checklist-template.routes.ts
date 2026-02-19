import { Router } from "express";
import { validate } from "@trustee/common";

import { ChecklistTemplateController } from "../controllers";
import {
  createChecklistTemplateSchema,
  updateChecklistTemplateSchema,
  importChecklistTemplateSchema,
} from "../validation";

export function createChecklistTemplateRoutes(controller: ChecklistTemplateController): Router {
  const router = Router();

  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", validate(createChecklistTemplateSchema), controller.create);
  router.post("/import", validate(importChecklistTemplateSchema), controller.importFromJson);
  router.patch("/:id", validate(updateChecklistTemplateSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
