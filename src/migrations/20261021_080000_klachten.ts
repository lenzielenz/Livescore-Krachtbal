import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Klachten over een ingediend wedstrijdblad (collections/Klachten.ts, lib/klacht.ts): een club
// klaagt, de federatie heropent het blad of wijst af; de PDF van vóór het heropenen blijft bewaard.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_klachten_status" AS ENUM('open', 'heropend', 'afgewezen');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "klachten" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"club_id" integer NOT NULL,
  	"ingediend_door_id" integer,
  	"reden" varchar NOT NULL,
  	"status" "enum_klachten_status" DEFAULT 'open',
  	"beslissing" varchar,
  	"behandeld_door_id" integer,
  	"behandeld_op" timestamp(3) with time zone,
  	"pdf_voor_heropenen_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "klachten_id" integer;

  DO $$ BEGIN
    ALTER TABLE "klachten" ADD CONSTRAINT "klachten_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "klachten" ADD CONSTRAINT "klachten_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "klachten" ADD CONSTRAINT "klachten_ingediend_door_id_users_id_fk" FOREIGN KEY ("ingediend_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "klachten" ADD CONSTRAINT "klachten_behandeld_door_id_users_id_fk" FOREIGN KEY ("behandeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "klachten" ADD CONSTRAINT "klachten_pdf_voor_heropenen_id_media_id_fk" FOREIGN KEY ("pdf_voor_heropenen_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_klachten_fk" FOREIGN KEY ("klachten_id") REFERENCES "public"."klachten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "klachten_match_idx" ON "klachten" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "klachten_club_idx" ON "klachten" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "klachten_ingediend_door_idx" ON "klachten" USING btree ("ingediend_door_id");
  CREATE INDEX IF NOT EXISTS "klachten_status_idx" ON "klachten" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "klachten_behandeld_door_idx" ON "klachten" USING btree ("behandeld_door_id");
  CREATE INDEX IF NOT EXISTS "klachten_pdf_voor_heropenen_idx" ON "klachten" USING btree ("pdf_voor_heropenen_id");
  CREATE INDEX IF NOT EXISTS "klachten_updated_at_idx" ON "klachten" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "klachten_created_at_idx" ON "klachten" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_klachten_id_idx" ON "payload_locked_documents_rels" USING btree ("klachten_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_klachten_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_klachten_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "klachten_id";
  DROP TABLE IF EXISTS "klachten" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_klachten_status";`)
}
