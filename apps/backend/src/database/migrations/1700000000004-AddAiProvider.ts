import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiProvider1700000000004 implements MigrationInterface {
  name = 'AddAiProvider1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      ADD COLUMN "ai_provider" text NOT NULL DEFAULT 'api'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "ai_provider"`);
  }
}
