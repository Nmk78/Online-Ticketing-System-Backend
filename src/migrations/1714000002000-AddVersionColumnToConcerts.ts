import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVersionColumnToConcerts1714000002000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE concerts ADD COLUMN version INTEGER NOT NULL DEFAULT 0`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite doesn't support DROP COLUMN in older versions
    // Recreate table without version column
    await queryRunner.query(`
      CREATE TABLE concerts_backup (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        venue VARCHAR(255) NOT NULL,
        date DATETIME NOT NULL,
        totalStock INTEGER NOT NULL DEFAULT 0,
        availableStock INTEGER NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
        updatedAt DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      INSERT INTO concerts_backup (id, name, venue, date, totalStock, availableStock, createdAt, updatedAt)
      SELECT id, name, venue, date, totalStock, availableStock, createdAt, updatedAt
      FROM concerts
    `);

    await queryRunner.query(`DROP TABLE concerts`);
    await queryRunner.query(`ALTER TABLE concerts_backup RENAME TO concerts`);
  }
}
