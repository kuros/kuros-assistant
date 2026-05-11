import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserSettings1700000000001 implements MigrationInterface {
  name = 'UserSettings1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_settings" (
        "user_id" uuid NOT NULL,
        "anthropic_api_key" text,
        "claude_model_fast" text,
        "claude_model_deep" text,
        CONSTRAINT "pk_user_settings" PRIMARY KEY ("user_id"),
        CONSTRAINT "fk_user_settings_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_settings"`);
  }
}
