import { Router } from "express";
import { validate } from "@trustee/common";

import { ContractController } from "../controllers";
import { createContractSchema, updateContractSchema } from "../validation";

export function createContractRoutes(controller: ContractController): Router {
  const router = Router();

  router.get("/trustee/:trusteeId", controller.listByTrustee);
  router.get("/:id", controller.getById);
  router.post("/", validate(createContractSchema), controller.create);
  router.patch("/:id", validate(updateContractSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
