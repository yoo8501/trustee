import { Router } from "express";
import { validate } from "@trustee/common";

import { AuthController } from "./auth.controller";
import { signupSchema, loginSchema } from "./validation";

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post("/signup", validate(signupSchema), controller.signup);
  router.post("/login", validate(loginSchema), controller.login);
  router.post("/logout", controller.logout);
  router.post("/refresh", controller.refresh);
  router.get("/me", controller.me);

  return router;
}
