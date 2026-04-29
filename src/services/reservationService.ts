import { AppDataSource } from "../data-source";
import { Concert } from "../entities/Concert";
import { Ticket } from "../entities/Ticket";
import { Reservation } from "../entities/Reservation";

const RESERVATION_TTL_MINUTES = 5;

/**
 * ATOMIC RESERVATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses a QueryRunner transaction to guarantee:
 *   1. Stock check + decrement are atomic (no race condition between two users)
 *   2. If the Reservation INSERT fails for any reason, the stock decrement
 *      is rolled back — stock is NEVER silently lost.
 *
 * Concurrency strategy:
 *   SQLite serialises writes, so the SELECT + UPDATE inside one transaction
 *   prevents double-booking. In a production Postgres setup you would add
 *   SELECT ... FOR UPDATE on the concert row.
 */
export const reserveTicket = async (userId: string, concertId: number) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  console.log(`[RESERVE] Starting transaction for userId=${userId} concertId=${concertId}`);

  try {
    // ── Step 1: Lock the concert row and read stock ──────────────────────────
    // SQLite serialises all writes at the WAL level, so running the stock
    // check + decrement inside a single BEGIN/COMMIT transaction is sufficient
    // to prevent double-booking. No explicit row-lock is needed (or supported).
    const concert = await queryRunner.manager.findOne(Concert, {
      where: { id: concertId },
    });

    if (!concert) {
      throw new Error(`Concert ${concertId} not found`);
    }

    if (concert.availableStock <= 0) {
      throw new Error(`No available tickets for concert "${concert.name}"`);
    }

    // ── Step 2: Find one available ticket ───────────────────────────────────
    // Uses IDX_ticket_concertId B-Tree index for O(log n) lookup.
    const ticket = await queryRunner.manager.findOne(Ticket, {
      where: { concertId, status: "AVAILABLE" },
    });

    if (!ticket) {
      throw new Error(`No AVAILABLE ticket found for concert ${concertId}`);
    }

    // ── Step 3: Decrement stock on the concert ───────────────────────────────
    concert.availableStock -= 1;
    await queryRunner.manager.save(Concert, concert);
    console.log(
      `[RESERVE] Decremented stock: concertId=${concertId} newStock=${concert.availableStock}`
    );

    // ── Step 4: Mark ticket as RESERVED ─────────────────────────────────────
    ticket.status = "RESERVED";
    await queryRunner.manager.save(Ticket, ticket);

    // ── Step 5: Create the Reservation record ────────────────────────────────
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESERVATION_TTL_MINUTES);

    const reservation = queryRunner.manager.create(Reservation, {
      userId,
      ticketId: ticket.id,
      concertId,
      status: "PENDING",
      expiresAt,
    });

    const savedReservation = await queryRunner.manager.save(
      Reservation,
      reservation
    );
    console.log(
      `[RESERVE] Reservation created id=${savedReservation.id} expiresAt=${expiresAt.toISOString()}`
    );

    // ── Commit ───────────────────────────────────────────────────────────────
    await queryRunner.commitTransaction();
    console.log(`[RESERVE] Transaction COMMITTED for reservation=${savedReservation.id}`);

    return savedReservation;
  } catch (err) {
    // ── Rollback — stock is restored to its pre-transaction value ────────────
    await queryRunner.rollbackTransaction();
    console.error(`[RESERVE] Transaction ROLLED BACK — ${(err as Error).message}`);
    throw err;
  } finally {
    await queryRunner.release();
  }
};

/**
 * PURCHASE CONFIRMATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts a PENDING reservation to COMPLETED.
 * Validates that the reservation belongs to the requesting user and has
 * not expired.
 */
export const purchaseTicket = async (reservationId: number, userId: string) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  console.log(`[PURCHASE] Starting for reservationId=${reservationId} userId=${userId}`);

  try {
    const reservation = await queryRunner.manager.findOne(Reservation, {
      where: { id: reservationId },
      relations: ["ticket"],
    });

    if (!reservation) {
      throw new Error(`Reservation ${reservationId} not found`);
    }

    if (reservation.userId !== userId) {
      throw new Error(`Reservation does not belong to user ${userId}`);
    }

    if (reservation.status !== "PENDING") {
      throw new Error(
        `Reservation is ${reservation.status} — cannot purchase`
      );
    }

    if (new Date() > reservation.expiresAt) {
      throw new Error(`Reservation ${reservationId} has expired`);
    }

    // Mark reservation as COMPLETED
    reservation.status = "COMPLETED";
    await queryRunner.manager.save(Reservation, reservation);

    // Mark ticket as SOLD
    const ticket = reservation.ticket;
    ticket.status = "SOLD";
    await queryRunner.manager.save(Ticket, ticket);

    await queryRunner.commitTransaction();
    console.log(`[PURCHASE] Reservation ${reservationId} COMPLETED`);

    return reservation;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error(`[PURCHASE] ROLLED BACK — ${(err as Error).message}`);
    throw err;
  } finally {
    await queryRunner.release();
  }
};

/**
 * CLEANUP — Release expired PENDING reservations
 * ─────────────────────────────────────────────────────────────────────────────
 * Called by the cron job every minute.
 *
 * Performance: the partial index IDX_reservation_pending_status makes this
 * query O(k) where k = number of currently PENDING reservations, NOT O(n)
 * where n = all-time reservations. After a busy night, n can be enormous
 * while k stays small.
 */
export const cleanupExpiredReservations = async (): Promise<number> => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  let releasedCount = 0;

  try {
    const now = new Date();

    // This query hits the partial index (only PENDING rows are in the index)
    const expiredReservations = await queryRunner.manager
      .getRepository(Reservation)
      .createQueryBuilder("r")
      .where("r.status = :status", { status: "PENDING" })
      .andWhere("r.expiresAt < :now", { now })
      .getMany();

    console.log(`[CLEANUP] Found ${expiredReservations.length} expired reservations`);

    for (const reservation of expiredReservations) {
      // Cancel the reservation
      reservation.status = "CANCELLED";
      await queryRunner.manager.save(Reservation, reservation);

      // Return the ticket to AVAILABLE
      await queryRunner.manager.update(Ticket, reservation.ticketId, {
        status: "AVAILABLE",
      });

      // Restore stock on the parent concert
      await queryRunner.manager
        .createQueryBuilder()
        .update(Concert)
        .set({ availableStock: () => '"availableStock" + 1' })
        .where("id = :id", { id: reservation.concertId })
        .execute();

      releasedCount++;
      console.log(
        `[CLEANUP] Released reservationId=${reservation.id} ticketId=${reservation.ticketId}`
      );
    }

    await queryRunner.commitTransaction();
    console.log(`[CLEANUP] COMMITTED — released ${releasedCount} reservations`);
    return releasedCount;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error(`[CLEANUP] ROLLED BACK — ${(err as Error).message}`);
    throw err;
  } finally {
    await queryRunner.release();
  }
};
