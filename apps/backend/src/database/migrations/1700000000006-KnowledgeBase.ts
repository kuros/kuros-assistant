import { MigrationInterface, QueryRunner } from 'typeorm';

export class KnowledgeBase1700000000006 implements MigrationInterface {
  name = 'KnowledgeBase1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wiki_ingestions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "summary_id" uuid NOT NULL REFERENCES "summaries"("id") ON DELETE CASCADE,
        "kind" varchar(16) NOT NULL,
        "period_date" date NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "source_label" text,
        "source_page" text,
        "pages_touched" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "error" text,
        "attempts" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_wiki_ingestions_summary" UNIQUE ("user_id", "summary_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_wiki_ingestions_user_status" ON "wiki_ingestions" ("user_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "chat_conversations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_chat_conversations_user_id" ON "chat_conversations" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL,
        "role" varchar(16) NOT NULL,
        "content" text NOT NULL,
        "citations" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "filed_to" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_chat_messages_conversation" ON "chat_messages" ("conversation_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP TABLE "chat_conversations"`);
    await queryRunner.query(`DROP TABLE "wiki_ingestions"`);
  }
}
