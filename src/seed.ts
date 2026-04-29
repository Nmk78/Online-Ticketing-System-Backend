import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { Concert } from "./entities/Concert";
import { Ticket } from "./entities/Ticket";

/**
 * Database Seeder
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates 3 sample concerts with a mix of VIP and General tickets.
 * Run after migrations: npm run seed
 */
async function seed() {
  await AppDataSource.initialize();
  console.log("\n[SEED] Connected to database\n");

  const concertRepo = AppDataSource.getRepository(Concert);
  const ticketRepo = AppDataSource.getRepository(Ticket);

  const concerts = [
    {
      name: "Midnight Echoes World Tour",
      venue: "Madison Square Garden",
      date: new Date("2025-08-15T20:00:00Z"),
      totalStock: 5,
      availableStock: 5,
    },
    {
      name: "Neon Pulse Electronic Festival",
      venue: "The O2 Arena, London",
      date: new Date("2025-09-20T18:00:00Z"),
      totalStock: 3,
      availableStock: 3,
    },
    {
      name: "Acoustic Horizons Unplugged",
      venue: "Sydney Opera House",
      date: new Date("2025-10-05T19:30:00Z"),
      totalStock: 4,
      availableStock: 4,
    },
  ];

  for (const concertData of concerts) {
    const existing = await concertRepo.findOne({
      where: { name: concertData.name },
    });
    if (existing) {
      console.log(`[SEED] Skipping existing concert: "${concertData.name}"`);
      continue;
    }

    const concert = concertRepo.create(concertData);
    const savedConcert = await concertRepo.save(concert);
    console.log(
      `[SEED] Created concert: "${savedConcert.name}" (id=${savedConcert.id})`
    );

    // Create VIP tickets (first 2) and General tickets (rest)
    const tickets: Partial<Ticket>[] = [];
    for (let i = 0; i < concertData.totalStock; i++) {
      tickets.push({
        concertId: savedConcert.id,
        price: i < 2 ? 299.99 : 89.99,
        status: "AVAILABLE",
        category: i < 2 ? "VIP" : "General",
      });
    }

    const savedTickets = await ticketRepo.save(tickets as Ticket[]);
    console.log(
      `[SEED]   → Created ${savedTickets.length} tickets (2 VIP, ${savedTickets.length - 2} General)`
    );
  }

  console.log("\n[SEED] Seeding complete!\n");
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("[SEED] Error:", err);
  process.exit(1);
});
