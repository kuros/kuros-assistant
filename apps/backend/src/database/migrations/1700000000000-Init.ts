import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  name = 'Init1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(320),
        "timezone" varchar(64),
        "name" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_email" ON "users"("email") WHERE "email" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "connectors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "kind" varchar(32) NOT NULL,
        "name" varchar(120) NOT NULL,
        "config" jsonb NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_connectors" PRIMARY KEY ("id"),
        CONSTRAINT "fk_connectors_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_connectors_kind" CHECK ("kind" IN ('slack','outlook')),
        CONSTRAINT "ck_connectors_status" CHECK ("status" IN ('active','paused','error'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_connectors_user_id" ON "connectors"("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "connector_sync_state" (
        "connector_id" uuid NOT NULL,
        "target_id" varchar(128) NOT NULL,
        "cursor" varchar(255),
        "last_run_at" timestamptz,
        "last_item_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_connector_sync_state" PRIMARY KEY ("connector_id","target_id"),
        CONSTRAINT "fk_connector_sync_state_connector" FOREIGN KEY ("connector_id")
          REFERENCES "connectors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "summaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "connector_id" uuid NOT NULL,
        "target_id" varchar(128) NOT NULL,
        "kind" varchar(16) NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "file_path" text NOT NULL,
        "item_count" integer NOT NULL,
        "model_used" varchar(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_summaries" PRIMARY KEY ("id"),
        CONSTRAINT "fk_summaries_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_summaries_connector" FOREIGN KEY ("connector_id")
          REFERENCES "connectors"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_summaries_kind" CHECK ("kind" IN ('daily','weekly')),
        CONSTRAINT "uq_summaries_period" UNIQUE ("user_id","connector_id","target_id","kind","period_start")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_summaries_user_id" ON "summaries"("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_summaries_connector_id" ON "summaries"("connector_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "insights" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "scope" varchar(16) NOT NULL,
        "scope_ref" varchar(128) NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "file_path" text NOT NULL,
        "model_used" varchar(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_insights" PRIMARY KEY ("id"),
        CONSTRAINT "fk_insights_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_insights_scope" CHECK ("scope" IN ('person','team','channel')),
        CONSTRAINT "uq_insights_scope_period" UNIQUE ("user_id","scope","scope_ref","period_start","period_end")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_insights_user_id" ON "insights"("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "action_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "source_summary_id" uuid,
        "title" varchar(512) NOT NULL,
        "detail" text,
        "due_date" date,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "file_path" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_action_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_action_items_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_action_items_summary" FOREIGN KEY ("source_summary_id")
          REFERENCES "summaries"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_action_items_status" CHECK ("status" IN ('open','in_progress','done','dismissed'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_action_items_user_id" ON "action_items"("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "risks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "source_summary_id" uuid,
        "title" varchar(512) NOT NULL,
        "detail" text,
        "severity" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "file_path" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_risks" PRIMARY KEY ("id"),
        CONSTRAINT "fk_risks_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_risks_summary" FOREIGN KEY ("source_summary_id")
          REFERENCES "summaries"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_risks_severity" CHECK ("severity" IN ('low','medium','high','critical')),
        CONSTRAINT "ck_risks_status" CHECK ("status" IN ('open','mitigated','accepted','closed'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_risks_user_id" ON "risks"("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "people" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" varchar(200) NOT NULL,
        "email" varchar(320),
        "slack_user_id" varchar(64),
        "outlook_address" varchar(320),
        "role" varchar(120),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_people" PRIMARY KEY ("id"),
        CONSTRAINT "fk_people_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_people_user_id" ON "people"("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_people_user_email" ON "people"("user_id","email") WHERE "email" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_teams" PRIMARY KEY ("id"),
        CONSTRAINT "fk_teams_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_teams_user_name" UNIQUE ("user_id","name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_teams_user_id" ON "teams"("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "team_members" (
        "team_id" uuid NOT NULL,
        "person_id" uuid NOT NULL,
        CONSTRAINT "pk_team_members" PRIMARY KEY ("team_id","person_id"),
        CONSTRAINT "fk_team_members_team" FOREIGN KEY ("team_id")
          REFERENCES "teams"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_team_members_person" FOREIGN KEY ("person_id")
          REFERENCES "people"("id") ON DELETE CASCADE
      )
    `);

    // Seed single user with all profile fields NULL (populated via onboarding UI)
    await queryRunner.query(`
      INSERT INTO "users" ("id","email","timezone","name")
      VALUES ('00000000-0000-0000-0000-000000000001', NULL, NULL, NULL)
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "team_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "teams"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "people"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "risks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "action_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "insights"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "summaries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connector_sync_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connectors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
