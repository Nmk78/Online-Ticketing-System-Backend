import "reflect-metadata";
import { AppDataSource } from "../data-source";

async function runMigrations() {
  await AppDataSource.initialize();
  console.log("[MIGRATE] Connected to database");

  const migrations = await AppDataSource.runMigrations({ transaction: "each" });

  if (migrations.length === 0) {
    console.log("[MIGRATE] No pending migrations.");
  } else {
    migrations.forEach((m) => console.log(`[MIGRATE] ✅ Ran: ${m.name}`));
  }

  await AppDataSource.destroy();
  console.log("[MIGRATE] Done.");
}

runMigrations().catch((err) => {
  console.error("[MIGRATE] Error:", err);
  process.exit(1);
});
