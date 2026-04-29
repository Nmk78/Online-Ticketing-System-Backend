import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { Concert } from "../entities/Concert";
import { Ticket } from "../entities/Ticket";
import { Reservation } from "../entities/Reservation";
import { reserveTicket, purchaseTicket, cleanupExpiredReservations } from "../services/reservationService";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

async function step(label: string, fn: () => Promise<void>) {
  console.log(`\n── ${label}`);
  try {
    await fn();
  } catch (err) {
    failed++;
    console.log(`  ❌ ${label}: ${(err as Error).message}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  FULL INTEGRATION TEST SUITE");
  console.log("═══════════════════════════════════════════════");

  await AppDataSource.initialize();

  // ── Reset: clean all reservations, reset tickets & stock ──
  const reservationRepo = AppDataSource.getRepository(Reservation);
  const ticketRepo = AppDataSource.getRepository(Ticket);
  const concertRepo = AppDataSource.getRepository(Concert);

  await reservationRepo.clear();
  await ticketRepo.clear();

  const concerts = await concertRepo.find({ order: { id: "ASC" } });
  for (const c of concerts) {
    c.availableStock = c.totalStock;
    await concertRepo.save(c);
  }

  // ── Create fresh test tickets ──
  for (const c of concerts) {
    const tickets = [];
    for (let i = 0; i < c.totalStock; i++) {
      tickets.push({
        concertId: c.id,
        price: i < 2 ? 299.99 : 89.99,
        status: "AVAILABLE" as const,
        category: i < 2 ? "VIP" as const : "General" as const,
      });
    }
    await ticketRepo.save(tickets);
  }
  console.log("[RESET] All reservations cleared, tickets and stock restored\n");

  // ── 0. Seed check ──────────────────────────────────────
  await step("0. Database has seeded concerts", async () => {
    const concerts = await concertRepo.find();
    assert(concerts.length >= 3, `Found ${concerts.length} concerts (expected >= 3)`);
  });

  // ── 1. GET /concerts equivalent ────────────────────────
  await step("1. List concerts with stock info", async () => {
    const concerts = await concertRepo.find({ order: { id: "ASC" } });
    concerts.forEach(c => {
      assert(c.totalStock > 0, `${c.name}: totalStock=${c.totalStock}`);
    });
  });

  // ── 2. POST /reserve ───────────────────────────────────
  let reservationId = 0;
  let ticketId = 0;
  let concertId = 0;
  const userId = "test-user-integration";

  await step("2. Reserve a ticket", async () => {
    const firstConcert = await concertRepo.findOne({ where: {}, order: { id: "ASC" } });
    assert(!!firstConcert, "Concert found");
    concertId = firstConcert!.id;

    const stockBefore = firstConcert!.availableStock;

    const reservation = await reserveTicket(userId, concertId);
    reservationId = reservation.id;
    ticketId = reservation.ticketId;

    assert(reservation.status === "PENDING", "Reservation status is PENDING");
    assert(reservation.userId === userId, "Reservation belongs to test user");
    assert(reservation.concertId === concertId, "Reservation linked to correct concert");

    const stockAfter = (await concertRepo.findOne({ where: { id: concertId } }))!.availableStock;
    assert(stockAfter === stockBefore - 1, `Stock decremented: ${stockBefore} → ${stockAfter}`);

    const ticket = await ticketRepo.findOne({ where: { id: ticketId } });
    assert(ticket!.status === "RESERVED", `Ticket ${ticketId} status is RESERVED`);
  });

  // ── 3. GET /reservations ───────────────────────────────
  await step("3. Query reservations (all + filtered)", async () => {
    const all = await reservationRepo.find({ order: { createdAt: "DESC" } });
    assert(all.length >= 1, `Total reservations: ${all.length}`);

    const byUser = await reservationRepo.find({ where: { userId } });
    assert(byUser.length >= 1, `Reservations for ${userId}: ${byUser.length}`);

    const pending = await reservationRepo.find({ where: { status: "PENDING" } });
    assert(pending.length >= 1, `PENDING reservations: ${pending.length}`);
  });

  // ── 4. POST /purchase ─────────────────────────────────
  await step("4. Purchase the reserved ticket", async () => {
    const reservation = await purchaseTicket(reservationId, userId);

    assert(reservation.status === "COMPLETED", "Reservation status is COMPLETED");

    const ticket = await ticketRepo.findOne({ where: { id: ticketId } });
    assert(ticket!.status === "SOLD", `Ticket ${ticketId} status is SOLD`);
  });

  // ── 5. Purchase already completed (should fail) ────────
  await step("5. Cannot purchase a COMPLETED reservation", async () => {
    try {
      await purchaseTicket(reservationId, userId);
      assert(false, "Should have thrown");
    } catch (err) {
      assert(
        (err as Error).message.includes("COMPLETED"),
        `Error mentions COMPLETED status: ${(err as Error).message}`
      );
    }
  });

  // ── 6. Wrong user purchase (should fail) ───────────────
  await step("6. Cannot purchase another user's reservation", async () => {
    const concert2 = await concertRepo.findOne({ where: { id: 2 } });
    assert(!!concert2, "Second concert found");
    const c2Id = concert2!.id;

    const r = await reserveTicket("other-user", c2Id);
    try {
      await purchaseTicket(r.id, userId);
      assert(false, "Should have thrown");
    } catch (err) {
      assert(
        (err as Error).message.includes("does not belong"),
        `Error mentions ownership: ${(err as Error).message}`
      );
    }
    // Cleanup: manually expire it
    await reservationRepo.delete(r.id);
    await ticketRepo.update(r.ticketId, { status: "AVAILABLE" });
    await concertRepo.query(`UPDATE concerts SET "availableStock" = "availableStock" + 1 WHERE id = ?`, [c2Id]);
  });

  // ── 7. Expired reservation cleanup ─────────────────────
  await step("7. Expired reservation cleanup restores stock", async () => {
    const concert2 = await concertRepo.findOne({ where: { id: 2 } });
    const c2Id = concert2!.id;

    const r = await reserveTicket("cleanup-test-user", c2Id);
    const stockBefore = (await concertRepo.findOne({ where: { id: c2Id } }))!.availableStock;

    // Force expiration
    const expiredAt = new Date();
    expiredAt.setMinutes(expiredAt.getMinutes() - 10);
    await reservationRepo.update(r.id, { expiresAt: expiredAt });

    const released = await cleanupExpiredReservations();
    assert(released >= 1, `Cleanup released ${released} reservation(s)`);

    const stockAfter = (await concertRepo.findOne({ where: { id: c2Id } }))!.availableStock;
    assert(stockAfter === stockBefore + 1, `Stock restored: ${stockBefore} → ${stockAfter}`);
  });

  // ── 8. ACID rollback proof ─────────────────────────────
  await step("8. ACID rollback preserves stock on failure", async () => {
    const concert = await concertRepo.findOne({ where: { id: concertId } });
    const stockBefore = concert!.availableStock;

    const qr = AppDataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      concert!.availableStock -= 1;
      await qr.manager.save(Concert, concert!);

      // Deliberate FK violation
      const bad = qr.manager.create(Reservation, {
        userId: "rollback-test",
        ticketId: 999999,
        concertId,
        status: "PENDING",
        expiresAt: new Date(),
      });
      await qr.manager.save(Reservation, bad);
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    const stockAfter = (await concertRepo.findOne({ where: { id: concertId } }))!.availableStock;
    assert(stockAfter === stockBefore, `Stock unchanged after rollback: ${stockBefore}`);
  });

  // ── Summary ────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  await AppDataSource.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
