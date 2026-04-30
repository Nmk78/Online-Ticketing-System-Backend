import { AppDataSource } from "../data-source";
import { Concert } from "../entities/Concert";
import { Ticket } from "../entities/Ticket";
import { Reservation } from "../entities/Reservation";
import {
  ConflictError,
  NotFoundError,
} from "../middleware/errors";
import { OptimisticLockVersionMismatchError } from "typeorm";
import { logger } from "../middleware/logger";

const RESERVATION_TTL_MINUTES = 5;
const concertLocks = new Map<number, Promise<void>>();

async function withConcertLock<T>(
  concertId: number,
  fn: () => Promise<T>
): Promise<T> {
  const previous = concertLocks.get(concertId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  concertLocks.set(concertId, previous.then(() => current));
  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (concertLocks.get(concertId) === current) {
      concertLocks.delete(concertId);
    }
  }
}

export const reserveTicketOptimistic = async (
  userId: string,
  concertId: number,
  quantity: number
) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const concert = await queryRunner.manager.findOne(Concert, {
      where: { id: concertId },
    });

    if (!concert) {
      throw new NotFoundError("Concert");
    }

    const stockUpdate = await queryRunner.manager
      .createQueryBuilder()
      .update(Concert)
      .set({
        availableStock: () => `"availableStock" - ${quantity}`,
        version: () => `"version" + 1`,
      })
      .where(
        "id = :id AND version = :version AND availableStock >= :quantity",
        {
          id: concertId,
          version: concert.version,
          quantity,
        }
      )
      .execute();

    if (!stockUpdate.affected || stockUpdate.affected === 0) {
      const latestConcert = await queryRunner.manager.findOne(Concert, {
        where: { id: concertId },
      });

      if (!latestConcert) {
        throw new NotFoundError("Concert");
      }

      if (latestConcert.availableStock < quantity) {
        throw new ConflictError(
          `Only ${latestConcert.availableStock} tickets available, requested ${quantity}`
        );
      }

      throw new ConflictError(
        "Concert data was modified by another request. Please try again."
      );
    }

    const availableTickets = await queryRunner.manager
      .getRepository(Ticket)
      .createQueryBuilder("ticket")
      .where("ticket.concertId = :concertId", { concertId })
      .andWhere("ticket.status = :status", { status: "AVAILABLE" })
      .orderBy("ticket.price", "ASC")
      .limit(quantity)
      .getMany();

    if (availableTickets.length < quantity) {
      await queryRunner.manager
        .createQueryBuilder()
        .update(Concert)
        .set({
          availableStock: () => `"availableStock" + ${quantity}`,
          version: () => `"version" + 1`,
        })
        .where("id = :id", { id: concertId })
        .execute();

      throw new ConflictError(
        `Only ${availableTickets.length} tickets available, requested ${quantity}`
      );
    }

    await queryRunner.manager
      .createQueryBuilder()
      .update(Ticket)
      .set({ status: "RESERVED" })
      .where("id IN (:...ids)", { ids: availableTickets.map((t) => t.id) })
      .execute();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESERVATION_TTL_MINUTES);

    const reservation = queryRunner.manager.create(Reservation, {
      userId,
      ticketId: availableTickets[0].id,
      concertId,
      status: "PENDING",
      expiresAt,
    });

    const savedReservation = await queryRunner.manager.save(
      Reservation,
      reservation
    );

    await queryRunner.commitTransaction();

    return savedReservation;
  } catch (err) {
    await queryRunner.rollbackTransaction();

    if (err instanceof OptimisticLockVersionMismatchError) {
      throw new ConflictError(
        "Concert data was modified by another request. Please try again."
      );
    }

    throw err;
  } finally {
    await queryRunner.release();
  }
};


export const reserveTicketPessimistic = async (
  userId: string,
  concertId: number,
  quantity: number
) => {
  if (AppDataSource.options.type === "sqlite") {
    logger.warn(
      { concertId },
      "SQLite does not support pessimistic row locks; using in-process lock fallback"
    );
    return withConcertLock(concertId, () =>
      reserveTicketAtomic(userId, concertId, quantity)
    );
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const concert = await queryRunner.manager
      .getRepository(Concert)
      .createQueryBuilder("concert")
      .setLock("pessimistic_write")
      .where("concert.id = :id", { id: concertId })
      .getOne();

    if (!concert) {
      throw new NotFoundError("Concert");
    }

    if (concert.availableStock < quantity) {
      throw new ConflictError(
        `Insufficient stock: ${concert.availableStock} available, ${quantity} requested`
      );
    }

    const availableTickets = await queryRunner.manager
      .getRepository(Ticket)
      .createQueryBuilder("ticket")
      .setLock("pessimistic_write")
      .where("ticket.concertId = :concertId", { concertId })
      .andWhere("ticket.status = :status", { status: "AVAILABLE" })
      .orderBy("ticket.price", "ASC")
      .limit(quantity)
      .getMany();

    if (availableTickets.length < quantity) {
      throw new ConflictError(
        `Only ${availableTickets.length} tickets available, requested ${quantity}`
      );
    }

    concert.availableStock -= quantity;
    await queryRunner.manager.save(concert);

    await queryRunner.manager
      .createQueryBuilder()
      .update(Ticket)
      .set({ status: "RESERVED" })
      .where("id IN (:...ids)", {
        ids: availableTickets.map((t) => t.id),
      })
      .execute();

    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + RESERVATION_TTL_MINUTES
    );

    const reservation = queryRunner.manager.create(Reservation, {
      userId,
      ticketId: availableTickets[0].id,
      concertId,
      status: "PENDING",
      expiresAt,
    });

    const saved = await queryRunner.manager.save(Reservation, reservation);

    await queryRunner.commitTransaction();
    return saved;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
};

export const reserveTicketAtomic = async (
  userId: string,
  concertId: number,
  quantity: number
) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const concert = await queryRunner.manager.findOne(Concert, {
      where: { id: concertId },
    });

    if (!concert) {
      throw new NotFoundError("Concert");
    }

    const stockResult = await queryRunner.manager
      .createQueryBuilder()
      .update(Concert)
      .set({ availableStock: () => `"availableStock" - ${quantity}` })
      .where("id = :id AND availableStock >= :qty", {
        id: concertId,
        qty: quantity,
      })
      .execute();

    if (!stockResult.affected || stockResult.affected === 0) {
      throw new ConflictError(
        `Insufficient stock for concert "${concert.name}"`
      );
    }

    const availableTickets = await queryRunner.manager
      .getRepository(Ticket)
      .createQueryBuilder("ticket")
      .where("ticket.concertId = :concertId", { concertId })
      .andWhere("ticket.status = :status", { status: "AVAILABLE" })
      .orderBy("ticket.price", "ASC")
      .limit(quantity)
      .getMany();

    if (availableTickets.length < quantity) {
      await queryRunner.manager
        .createQueryBuilder()
        .update(Concert)
        .set({ availableStock: () => `"availableStock" + ${quantity}` })
        .where("id = :id", { id: concertId })
        .execute();

      throw new ConflictError(
        `Only ${availableTickets.length} tickets available, requested ${quantity}`
      );
    }

    await queryRunner.manager
      .createQueryBuilder()
      .update(Ticket)
      .set({ status: "RESERVED" })
      .where("id IN (:...ids)", { ids: availableTickets.map((t) => t.id) })
      .execute();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESERVATION_TTL_MINUTES);

    const reservation = queryRunner.manager.create(Reservation, {
      userId,
      ticketId: availableTickets[0].id,
      concertId,
      status: "PENDING",
      expiresAt,
    });

    const savedReservation = await queryRunner.manager.save(
      Reservation,
      reservation
    );

    await queryRunner.commitTransaction();

    return savedReservation;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
};
