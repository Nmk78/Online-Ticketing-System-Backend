import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Reservation } from "../entities/Reservation";
import {
  reserveTicket,
  purchaseTicket,
  cleanupExpiredReservations,
} from "../services/reservationService";

const router = Router();

/**
 * GET /reservations
 * Query params: userId (optional), status (optional)
 *
 * Lists all reservations with optional filtering.
 */
router.get("/reservations", async (req: Request, res: Response) => {
  const { userId, status } = req.query;

  try {
    const repo = AppDataSource.getRepository(Reservation);
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const reservations = await repo.find({
      where: Object.keys(where).length ? where : {},
      order: { createdAt: "DESC" },
    });

    res.json({ success: true, data: reservations });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

/**
 * POST /reserve
 * Body: { userId: string, concertId: number }
 *
 * Atomically reserves one ticket for the user for 5 minutes.
 * Returns 409 if stock is 0 or unavailable.
 */
router.post("/reserve", async (req: Request, res: Response) => {
  const { userId, concertId } = req.body;

  if (!userId || !concertId) {
    res.status(400).json({
      success: false,
      message: "userId and concertId are required",
    });
    return;
  }

  try {
    const reservation = await reserveTicket(String(userId), Number(concertId));
    res.status(201).json({
      success: true,
      message: "Ticket reserved. You have 5 minutes to complete your purchase.",
      data: reservation,
    });
  } catch (err) {
    const message = (err as Error).message;
    const isStockError =
      message.includes("No available") || message.includes("stock");
    res.status(isStockError ? 409 : 500).json({ success: false, message });
  }
});

/**
 * POST /purchase
 * Body: { reservationId: number, userId: string }
 *
 * Converts a PENDING reservation to COMPLETED.
 * Returns 400 if reservation is expired, wrong user, or wrong status.
 */
router.post("/purchase", async (req: Request, res: Response) => {
  const { reservationId, userId } = req.body;

  if (!reservationId || !userId) {
    res.status(400).json({
      success: false,
      message: "reservationId and userId are required",
    });
    return;
  }

  try {
    const reservation = await purchaseTicket(
      Number(reservationId),
      String(userId)
    );
    res.json({
      success: true,
      message: "Purchase confirmed!",
      data: reservation,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
});

/**
 * POST /cleanup
 * Manual trigger for the cleanup cron job logic.
 * (The same function is also called automatically by the cron schedule.)
 */
router.post("/cleanup", async (_req: Request, res: Response) => {
  try {
    const released = await cleanupExpiredReservations();
    res.json({
      success: true,
      message: `Cleanup complete. Released ${released} expired reservation(s).`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

export default router;
