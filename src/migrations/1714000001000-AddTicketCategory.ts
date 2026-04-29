import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration 2: Add category column to tickets
 *
 * Change Request: adds a "category" column (enum: 'VIP' | 'General')
 * to support tiered ticketing.
 *
 * Because SQLite does not support ALTER TABLE ... ADD COLUMN with CHECK
 * constraints referencing other tables, we add the column with a DEFAULT
 * value so all existing rows automatically become 'General'.
 */
export class AddTicketCategory1714000001000 implements MigrationInterface {
  name = "AddTicketCategory1714000001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tickets"
        ADD COLUMN "category" VARCHAR(10) NOT NULL DEFAULT 'General'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite does not support DROP COLUMN natively (pre-3.35).
    // We recreate the table without the column for full rollback support.
    await queryRunner.query(`
      CREATE TABLE "tickets_backup" (
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
    await queryRunner.query(`
      INSERT INTO "tickets_backup" SELECT "id","concertId","price","status","createdAt","updatedAt"
      FROM "tickets"
    `);
    await queryRunner.query(`DROP TABLE "tickets"`);
    await queryRunner.query(`ALTER TABLE "tickets_backup" RENAME TO "tickets"`);
    await queryRunner.query(`
      CREATE INDEX "IDX_ticket_concertId" ON "tickets" ("concertId")
    `);
  }
}
