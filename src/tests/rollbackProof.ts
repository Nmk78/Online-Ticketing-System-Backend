import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { Concert } from "../entities/Concert";
import { Ticket } from "../entities/Ticket";
import { Reservation } from "../entities/Reservation";

/**
 * ROLLBACK PROOF TEST
 * ─────────────────────────────────────────────────────────────────────────────
 * This script proves the ACID guarantee:
 *
 *   "If the Reservation record fails to save, the Concert's availableStock
 *    is rolled back — stock is NEVER silently lost."
 *
 * HOW IT WORKS:
 *   1. Record the concert's initial stock.
 *   2. Start a transaction and decrement stock (simulating partial work).
 *   3. Deliberately throw an error BEFORE committing.
 *   4. The catch block rolls back the transaction.
 *   5. Re-read the concert from DB and assert stock is unchanged.
 *
 * EXPECTED OUTPUT:
 *   ✅ PASS: Stock correctly rolled back from X to X (unchanged)
 */
async function runRollbackProofTest() {
  await AppDataSource.initialize();
  console.log("\n══════════════════════════════════════════════════");
  console.log("  ROLLBACK PROOF TEST");
  console.log("══════════════════════════════════════════════════\n");

  const concertRepo = AppDataSource.getRepository(Concert);

  // Find the first concert with stock > 0
  const concert = await concertRepo.findOne({
    where: {},
    order: { id: "ASC" },
  });

  if (!concert) {
    console.error("❌ No concert found. Run the seeder first: npm run seed");
    process.exit(1);
  }

  const stockBefore = concert.availableStock;
  console.log(
    `🎵 Concert: "${concert.name}" (id=${concert.id})`
  );
  console.log(`📦 Initial availableStock: ${stockBefore}\n`);

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ── Partial work: decrement stock ────────────────────────────────────────
    concert.availableStock -= 1;
    await queryRunner.manager.save(Concert, concert);
    console.log(
      `   [TX] Stock decremented to ${concert.availableStock} inside transaction`
    );

    // Also mark a ticket as RESERVED (to simulate full reservation flow)
    const ticket = await queryRunner.manager.findOne(Ticket, {
      where: { concertId: concert.id, status: "AVAILABLE" },
    });
    if (ticket) {
      ticket.status = "RESERVED";
      await queryRunner.manager.save(Ticket, ticket);
      console.log(`   [TX] Ticket ${ticket.id} set to RESERVED`);
    }

    // ── DELIBERATE FAILURE — simulates a DB constraint violation or crash ────
    console.log(
      "\n   [TX] 💥 Simulating Reservation INSERT failure...\n"
    );

    // Attempt to save a Reservation with an invalid ticketId (FK violation)
    const badReservation = queryRunner.manager.create(Reservation, {
      userId: "test-rollback-user",
      ticketId: 999999, // ← This FK does NOT exist → will trigger rollback
      concertId: concert.id,
      status: "PENDING",
      expiresAt: new Date(),
    });

    await queryRunner.manager.save(Reservation, badReservation);

    // We never reach here
    await queryRunner.commitTransaction();
  } catch (err) {
    // ── Rollback ─────────────────────────────────────────────────────────────
    await queryRunner.rollbackTransaction();
    console.log(`   [TX] ❌ Error caught: ${(err as Error).message}`);
    console.log("   [TX] 🔄 Rolling back transaction...\n");
  } finally {
    await queryRunner.release();
  }

  // ── Verify stock is unchanged ─────────────────────────────────────────────
  const concertAfter = await concertRepo.findOne({
    where: { id: concert.id },
  });
  const stockAfter = concertAfter!.availableStock;

  console.log(`📦 availableStock AFTER rollback: ${stockAfter}`);

  if (stockAfter === stockBefore) {
    console.log(
      `\n✅ PASS: Stock correctly rolled back from ${stockBefore} to ${stockAfter} (unchanged)`
    );
    console.log("   The transaction guarantee is working correctly.\n");
  } else {
    console.error(
      `\n❌ FAIL: Stock was ${stockBefore} before, but is ${stockAfter} after rollback!`
    );
    console.error("   Stock was LOST — the ACID guarantee is broken.\n");
    process.exit(1);
  }

  await AppDataSource.destroy();
}

runRollbackProofTest().catch((err) => {
  console.error("Unhandled error in rollback test:", err);
  process.exit(1);
});
