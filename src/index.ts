import "reflect-metadata";
import express from "express";
import path from "path";
import { AppDataSource } from "./data-source";
import { startCleanupCron } from "./cron/cleanupJob";
import concertRoutes from "./routes/concerts";
import reservationRoutes from "./routes/reservations";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/concerts", concertRoutes);
app.use("/", reservationRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
AppDataSource.initialize()
  .then(() => {
    console.log("[DB] Database connected and migrations verified");

    startCleanupCron();

    app.listen(PORT, () => {
      console.log(`\n🎟️  Concert Ticketing API running on http://localhost:${PORT}`);
      console.log(`   GET  /test-ui.html  — Route testing UI`);
      console.log(`   GET  /health        — Health check`);
      console.log(`   GET  /concerts      — List concerts & stock`);
      console.log(`   POST /reserve       — Reserve a ticket (5 min hold)`);
      console.log(`   POST /purchase      — Confirm a reservation`);
      console.log(`   POST /cleanup       — Manual cleanup trigger\n`);
    });
  })
  .catch((err) => {
    console.error("[DB] Failed to initialize database:", err);
    process.exit(1);
  });

export default app;
