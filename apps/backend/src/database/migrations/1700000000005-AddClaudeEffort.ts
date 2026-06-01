import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClaudeEffort1700000000005 implements MigrationInterface {
  name = 'AddClaudeEffort1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      ADD COLUMN "claude_effort_fast" text
    `);
    await queryRunner.query(`
      ALTER TABLE "user_settings"
      ADD COLUMN "claude_effort_deep" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "claude_effort_deep"`);
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "claude_effort_fast"`);
  }
}
