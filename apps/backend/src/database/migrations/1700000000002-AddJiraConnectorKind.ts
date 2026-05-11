import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJiraConnectorKind1700000000002 implements MigrationInterface {
  name = 'AddJiraConnectorKind1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "connectors" DROP CONSTRAINT "ck_connectors_kind"`);
    await queryRunner.query(
      `ALTER TABLE "connectors" ADD CONSTRAINT "ck_connectors_kind" CHECK ("kind" IN ('slack','outlook','jira'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "connectors" DROP CONSTRAINT "ck_connectors_kind"`);
    await queryRunner.query(
      `ALTER TABLE "connectors" ADD CONSTRAINT "ck_connectors_kind" CHECK ("kind" IN ('slack','outlook'))`,
    );
  }
}
