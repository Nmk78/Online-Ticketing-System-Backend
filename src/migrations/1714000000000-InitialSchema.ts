import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration 1: Initial Schema
 *
 * Creates tables: concerts, tickets, reservations
 *
 * Indexes created:
 *   1. B-Tree index on tickets.concertId  — speeds up "find all tickets for a concert"
 *   2. Partial index on reservations.status WHERE status = 'PENDING'
 *      — only indexes PENDING rows; far smaller than a full index.
 *        The cleanup cron job ONLY queries PENDING rows, so it hits this
 *        tiny index instead of scanning the entire table.
 */
export class InitialSchema1714000000000 implements MigrationInterface {
  name = "InitialSchema1714000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── concerts ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "concerts" (
        "id"             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name"           VARCHAR(255) NOT NULL,
        "venue"          VARCHAR(255) NOT NULL,
        "date"           DATETIME NOT NULL,
        "totalStock"     INTEGER NOT NULL DEFAULT 0,
        "availableStock" INTEGER NOT NULL DEFAULT 0,
        "createdAt"      DATETIME NOT NULL DEFAULT (datetime('now')),
        "updatedAt"      DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // ── tickets ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tickets" (
        "id"        INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "concertId" INTEGER NOT NULL,
        "price"     DECIMAL(10,2) NOT NULL,
        "status"    VARCHAR(10) NOT NULL DEFAULT 'AVAILABLE',
        "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
        "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_ticket_concert" FOREIGN KEY ("concertId")
          REFERENCES "concerts" ("id") ON DELETE CASCADE
      )
    `);

    // B-Tree index on concertId — essential for "find available tickets for
    // concert X" queries which happen on every reservation attempt.
    await queryRunner.query(`
      CREATE INDEX "IDX_ticket_concertId" ON "tickets" ("concertId")
    `);

    // ── reservations ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id"        INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId"    VARCHAR(255) NOT NULL,
        "ticketId"  INTEGER NOT NULL,
        "concertId" INTEGER NOT NULL,
        "status"    VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
        "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_reservation_ticket" UNIQUE ("ticketId"),
        CONSTRAINT "FK_reservation_ticket" FOREIGN KEY ("ticketId")
          REFERENCES "tickets" ("id") ON DELETE CASCADE
      )
    `);

    // Partial index: only PENDING reservations are indexed.
    //
    // WHY PARTIAL over FULL index?
    // Once a reservation becomes COMPLETED or CANCELLED it is never queried
    // by the cleanup job. A full index would waste space tracking thousands
    // of dead rows. The partial index stays tiny (only live PENDING rows),
    // fits in RAM, and makes the expiry scan O(k) where k = active holds —
    // not O(n) where n = all-time reservations.
    await queryRunner.query(`
      CREATE INDEX "IDX_reservation_pending_status"
        ON "reservations" ("status", "expiresAt")
        WHERE status = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reservation_pending_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ticket_concertId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "concerts"`);
  }
}
