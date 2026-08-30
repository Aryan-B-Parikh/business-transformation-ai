import { Router, Request, Response } from "express";
import { getJwks } from "../auth/keys";

const router = Router();

router.get("/.well-known/jwks.json", (req: Request, res: Response) => {
  const jwks = getJwks();
  res.json(jwks);
});

export default router;
