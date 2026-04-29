import { Router, Request, Response } from "express";
import { getConcerts } from "../services/concertService";

const router = Router();

/**
 * GET /concerts
 * Returns all concerts with their current available stock.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const concerts = await getConcerts();
    res.json({
      success: true,
      data: concerts,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
