import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../data-source";
import { Reservation } from "../entities/Reservation";
import { Concert } from "../entities/Concert";
import { Ticket } from "../entities/Ticket";
import {
  reserveTicketOptimistic,
  reserveTicketPessimistic,
  reserveTicketAtomic,
} from "../services/hardenedReservationService";
import { validate } from "../middleware/validate";
import { reserveSchema, purchaseSchema } from "../middleware/schemas";
import {
  serializeReservation,
  serializeConcert,
  serializeList,
} from "../middleware/dto";
import { ConflictError, NotFoundError } from "../middleware/errors";
import { createReserveRateLimiter } from "../middleware/rateLimiter";
import { httpLogger } from "../middleware/logger";

const router = Router();

let reserveRateLimiter: unknown = (
  _req: Request,
  _res: Response,
  next: NextFunction
) => next();

export async function initHardenedRoutes() {
  reserveRateLimiter = await createReserveRateLimiter();
  return router;
}

/**
 * @swagger
 * /api/v1/tickets:
 *   get:
 *     summary: List all reservations
 *     tags: [Tickets]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of reservations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ReservationDTO'
 */
router.get("/tickets", async (req: Request, res: Response) => {
  const { userId, status } = req.query;

  httpLogger.info({ userId, status }, "List tickets request received");

  const repo = AppDataSource.getRepository(Reservation);
  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (status) where.status = status;

  const reservations = await repo.find({
    where: Object.keys(where).length ? where : {},
    order: { createdAt: "DESC" },
  });

  const serialized = serializeList(reservations, serializeReservation);

  res.json({ success: true, data: serialized });
});

/**
 * @swagger
 * /api/v1/reserve:
 *   post:
 *     summary: Reserve tickets (Optimistic Locking)
 *     tags: [Reservations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, concertId]
 *             properties:
 *               userId:
 *                 type: string
 *               concertId:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       201:
 *         description: Ticket reserved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ReservationDTO'
 *       409:
 *         description: Conflict - stock unavailable or version mismatch
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorDTO'
 *       429:
 *         description: Rate limit exceeded
 *       400:
 *         description: Validation error
 */
router.post(
  "/reserve",
  reserveRateLimiter as Parameters<typeof router.post>[1],
  validate(reserveSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId, concertId, quantity } = req.body;

    httpLogger.info(
      { userId, concertId, quantity },
      "Optimistic reserve request received"
    );

    const reservation = await reserveTicketOptimistic(
      userId,
      concertId,
      quantity
    );

    const serialized = serializeReservation(reservation);

    res.status(201).json({
      success: true,
      message:
        "Ticket reserved. You have 5 minutes to complete your purchase.",
      data: serialized,
    });
  }
);

/**
 * @swagger
 * /api/v1/reserve/pessimistic:
 *   post:
 *     summary: Reserve tickets (Pessimistic Locking)
 *     tags: [Reservations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, concertId]
 *             properties:
 *               userId:
 *                 type: string
 *               concertId:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       201:
 *         description: Ticket reserved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ReservationDTO'
 *       409:
 *         description: Conflict - stock unavailable (row was locked by another transaction)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorDTO'
 */
router.post(
  "/reserve/pessimistic",
  reserveRateLimiter as Parameters<typeof router.post>[1],
  validate(reserveSchema),
  async (req: Request, res: Response) => {
    const { userId, concertId, quantity } = req.body;

    httpLogger.info(
      { userId, concertId, quantity },
      "Pessimistic reserve request received"
    );

    const reservation = await reserveTicketPessimistic(
      userId,
      concertId,
      quantity
    );

    const serialized = serializeReservation(reservation);

    res.status(201).json({
      success: true,
      message:
        "Ticket reserved (pessimistic lock). You have 5 minutes to complete your purchase.",
      data: serialized,
    });
  }
);

/**
 * @swagger
 * /api/v1/reserve/atomic:
 *   post:
 *     summary: Reserve tickets (Atomic Stock Decrease)
 *     description: Uses a single UPDATE ... WHERE stock > 0 statement instead of read-modify-write
 *     tags: [Reservations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, concertId]
 *             properties:
 *               userId:
 *                 type: string
 *               concertId:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       201:
 *         description: Ticket reserved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ReservationDTO'
 *       409:
 *         description: Conflict - insufficient stock
 */
router.post(
  "/reserve/atomic",
  reserveRateLimiter as Parameters<typeof router.post>[1],
  validate(reserveSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId, concertId, quantity } = req.body;

    httpLogger.info(
      { userId, concertId, quantity },
      "Atomic reserve request received"
    );

    const reservation = await reserveTicketAtomic(userId, concertId, quantity);

    const serialized = serializeReservation(reservation);

    res.status(201).json({
      success: true,
      message: "Ticket reserved (atomic stock). You have 5 minutes to complete your purchase.",
      data: serialized,
    });
  }
);

const purchaseHandler = async (
  req: Request,
  res: Response
) => {
  const { reservationId, userId } = req.body;

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const reservation = await queryRunner.manager.findOne(Reservation, {
      where: { id: reservationId },
      relations: ["ticket"],
    });

    if (!reservation) {
      throw new NotFoundError("Reservation");
    }

    if (reservation.userId !== userId) {
      throw new ConflictError("Reservation does not belong to this user");
    }

    if (reservation.status !== "PENDING") {
      throw new ConflictError(
        `Reservation is ${reservation.status} — cannot purchase`
      );
    }

    if (new Date() > reservation.expiresAt) {
      throw new ConflictError("Reservation has expired");
    }

    reservation.status = "COMPLETED";
    await queryRunner.manager.save(Reservation, reservation);

    const ticket = reservation.ticket;
    ticket.status = "SOLD";
    await queryRunner.manager.save(Ticket, ticket);

    await queryRunner.commitTransaction();

    const serialized = serializeReservation(reservation);

    res.json({
      success: true,
      message: "Purchase confirmed!",
      data: serialized,
    });
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
};

/**
 * @swagger
 * /api/v1/tickets:
 *   post:
 *     summary: Confirm a reservation purchase
 *     tags: [Reservations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reservationId, userId]
 *             properties:
 *               reservationId:
 *                 type: integer
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Purchase confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ReservationDTO'
 *       409:
 *         description: Conflict
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorDTO'
 */
router.post("/tickets", validate(purchaseSchema), purchaseHandler);

/**
 * @swagger
 * /api/v1/purchase:
 *   post:
 *     summary: Confirm a reservation purchase
 *     tags: [Reservations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reservationId, userId]
 *             properties:
 *               reservationId:
 *                 type: integer
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Purchase confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ReservationDTO'
 *       400:
 *         description: Invalid reservation
 */
router.post(
  "/purchase",
  validate(purchaseSchema),
  purchaseHandler
);

/**
 * @swagger
 * /api/v1/concerts:
 *   get:
 *     summary: List all concerts
 *     tags: [Concerts]
 *     responses:
 *       200:
 *         description: List of concerts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ConcertDTO'
 */
router.get("/concerts", async (req: Request, res: Response) => {
  const repo = AppDataSource.getRepository(Concert);
  const concerts = await repo.find({ order: { date: "ASC" } });
  const serialized = serializeList(concerts, serializeConcert);
  res.json({ success: true, data: serialized });
});

export default router;
