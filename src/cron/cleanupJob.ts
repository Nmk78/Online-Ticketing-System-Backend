import cron from "node-cron";
import { cleanupExpiredReservations } from "../services/reservationService";

/**
 * Cleanup Cron Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every minute. Queries ONLY via the partial index on PENDING rows,
 * so the scan remains fast regardless of total reservation history.
 *
 * Schedule: "* * * * *" = every minute
 */
export const startCleanupCron = () => {
  console.log("[CRON] Cleanup job registered — runs every minute");

  cron.schedule("* * * * *", async () => {
    console.log(`[CRON] Running cleanup at ${new Date().toISOString()}`);
    try {
      const released = await cleanupExpiredReservations();
      if (released > 0) {
        console.log(`[CRON] Released ${released} expired reservation(s) back to stock`);
      }
    } catch (err) {
      console.error("[CRON] Cleanup error:", (err as Error).message);
    }
  });
};
