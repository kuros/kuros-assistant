import { MigrationInterface, QueryRunner } from 'typeorm';

export class WikiIngestionTiming1700000000007 implements MigrationInterface {
  name = 'WikiIngestionTiming1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wiki_ingestions" ADD COLUMN "started_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "wiki_ingestions" ADD COLUMN "finished_at" timestamptz`);
    await queryRunner.query(
      `CREATE INDEX "idx_wiki_ingestions_user_finished" ON "wiki_ingestions" ("user_id", "finished_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_wiki_ingestions_user_finished"`);
    await queryRunner.query(`ALTER TABLE "wiki_ingestions" DROP COLUMN "finished_at"`);
    await queryRunner.query(`ALTER TABLE "wiki_ingestions" DROP COLUMN "started_at"`);
  }
}
