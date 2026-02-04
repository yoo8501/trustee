import { Router } from "express";
import { validate } from "@trustee/common";

import { TrusteeController } from "../controllers";
import { createTrusteeSchema, updateTrusteeSchema } from "../validation";

export function createTrusteeRoutes(controller: TrusteeController): Router {
  const router = Router();

  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", validate(createTrusteeSchema), controller.create);
  router.patch("/:id", validate(updateTrusteeSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
