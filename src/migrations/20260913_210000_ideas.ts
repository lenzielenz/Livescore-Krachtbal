import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Publieke ideeënbus met blijvende opvolging in Payload Admin.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "ideas" (
    "id" serial PRIMARY KEY NOT NULL,
    "category" varchar NOT NULL,
    "subject" varchar NOT NULL,
    "message" varchar NOT NULL,
    "name" varchar,
    "email" varchar,
    "submitted_by_id" integer,
    "page_url" varchar,
    "status" varchar DEFAULT 'new' NOT NULL,
    "admin_notes" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ideas_id" integer;

  ALTER TABLE "ideas" ADD CONSTRAINT "ideas_submitted_by_id_users_id_fk"
    FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ideas_submitted_by_idx" ON "ideas" USING btree ("submitted_by_id");
  CREATE INDEX "ideas_category_idx" ON "ideas" USING btree ("category");
  CREATE INDEX "ideas_status_idx" ON "ideas" USING btree ("status");
  CREATE INDEX "ideas_updated_at_idx" ON "ideas" USING btree ("updated_at");
  CREATE INDEX "ideas_created_at_idx" ON "ideas" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ideas_fk"
    FOREIGN KEY ("ideas_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ideas_id_idx"
    ON "payload_locked_documents_rels" USING btree ("ideas_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ideas_fk";
  DROP INDEX "payload_locked_documents_rels_ideas_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ideas_id";
  DROP TABLE "ideas" CASCADE;
  `)
}
