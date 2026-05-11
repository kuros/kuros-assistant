import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeamDescription1700000000003 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE teams DROP COLUMN IF EXISTS description`);
  }
}
