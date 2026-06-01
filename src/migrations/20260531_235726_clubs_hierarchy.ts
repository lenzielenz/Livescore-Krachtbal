import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Step 1: Create the clubs table
  await db.execute(sql`
    CREATE TABLE "clubs" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "logo_id" integer,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `)

  // Step 2: Add club_id as NULLABLE first (existing rows get NULL)
  await db.execute(sql`
    ALTER TABLE "teams" ADD COLUMN "club_id" integer;
  `)

  // Step 3: Insert a placeholder club and backfill existing teams
  await db.execute(sql`
    INSERT INTO "clubs" ("name") VALUES ('Onbekend')
    ON CONFLICT DO NOTHING;
  `)
  await db.execute(sql`
    UPDATE "teams" SET "club_id" = (SELECT MIN("id") FROM "clubs") WHERE "club_id" IS NULL;
  `)

  // Step 4: Now apply the NOT NULL constraint
  await db.execute(sql`
    ALTER TABLE "teams" ALTER COLUMN "club_id" SET NOT NULL;
  `)

  // Step 5: Add remaining columns, constraints, and indexes
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "clubs_id" integer;
    ALTER TABLE "clubs" ADD CONSTRAINT "clubs_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "clubs_logo_idx" ON "clubs" USING btree ("logo_id");
    CREATE INDEX "clubs_updated_at_idx" ON "clubs" USING btree ("updated_at");
    CREATE INDEX "clubs_created_at_idx" ON "clubs" USING btree ("created_at");
    ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clubs_fk" FOREIGN KEY ("clubs_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "teams_club_idx" ON "teams" USING btree ("club_id");
    CREATE INDEX "payload_locked_documents_rels_clubs_id_idx" ON "payload_locked_documents_rels" USING btree ("clubs_id");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clubs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "clubs" CASCADE;
  ALTER TABLE "teams" DROP CONSTRAINT "teams_club_id_clubs_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_clubs_fk";
  
  DROP INDEX "teams_club_idx";
  DROP INDEX "payload_locked_documents_rels_clubs_id_idx";
  ALTER TABLE "teams" DROP COLUMN "club_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "clubs_id";`)
}
