import "reflect-metadata";
import { AppDataSource } from "../data-source";

async function revertMigration() {
  await AppDataSource.initialize();
  console.log("[REVERT] Connected to database");
  await AppDataSource.undoLastMigration({ transaction: "each" });
  console.log("[REVERT] Last migration reverted.");
  await AppDataSource.destroy();
}

revertMigration().catch((err) => {
  console.error("[REVERT] Error:", err);
  process.exit(1);
});
