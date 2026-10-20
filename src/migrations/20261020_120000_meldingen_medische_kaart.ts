import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// E-mailadres per lid (eigen login na goedkeuring), de instelling "e-mail verplicht vanaf" (standaard
// 13 jaar), de meldingenbox (🔔) en de aanvragen voor een medische kaart (door het lid of de club).
// Zie collections/Meldingen.ts, collections/MedischeKaartAanvragen.ts en lib/medische-kaart.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_medische_kaart_aanvragen_via" AS ENUM('lid', 'club');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_medische_kaart_aanvragen_status" AS ENUM('aangevraagd', 'verstuurd', 'geweigerd');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "email" varchar;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "email_verplicht_vanaf" numeric DEFAULT 13;

  CREATE TABLE IF NOT EXISTS "meldingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"titel" varchar NOT NULL,
  	"tekst" varchar,
  	"url" varchar,
  	"gelezen" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "medische_kaart_aanvragen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"club_id" integer,
  	"aangevraagd_door_id" integer,
  	"via" "enum_medische_kaart_aanvragen_via" NOT NULL,
  	"status" "enum_medische_kaart_aanvragen_status" DEFAULT 'aangevraagd' NOT NULL,
  	"opmerking" varchar,
  	"behandeld_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "meldingen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "medische_kaart_aanvragen_id" integer;

  DO $$ BEGIN
    ALTER TABLE "meldingen" ADD CONSTRAINT "meldingen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "medische_kaart_aanvragen" ADD CONSTRAINT "medische_kaart_aanvragen_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "medische_kaart_aanvragen" ADD CONSTRAINT "medische_kaart_aanvragen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "medische_kaart_aanvragen" ADD CONSTRAINT "medische_kaart_aanvragen_aangevraagd_door_id_users_id_fk" FOREIGN KEY ("aangevraagd_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meldingen_fk" FOREIGN KEY ("meldingen_id") REFERENCES "public"."meldingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_medische_kaart_aanvragen_fk" FOREIGN KEY ("medische_kaart_aanvragen_id") REFERENCES "public"."medische_kaart_aanvragen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "meldingen_user_idx" ON "meldingen" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "meldingen_gelezen_idx" ON "meldingen" USING btree ("gelezen");
  CREATE INDEX IF NOT EXISTS "meldingen_updated_at_idx" ON "meldingen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "meldingen_created_at_idx" ON "meldingen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "medische_kaart_aanvragen_player_idx" ON "medische_kaart_aanvragen" USING btree ("player_id");
  CREATE INDEX IF NOT EXISTS "medische_kaart_aanvragen_club_idx" ON "medische_kaart_aanvragen" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "medische_kaart_aanvragen_aangevraagd_door_idx" ON "medische_kaart_aanvragen" USING btree ("aangevraagd_door_id");
  CREATE INDEX IF NOT EXISTS "medische_kaart_aanvragen_status_idx" ON "medische_kaart_aanvragen" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "medische_kaart_aanvragen_updated_at_idx" ON "medische_kaart_aanvragen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "medische_kaart_aanvragen_created_at_idx" ON "medische_kaart_aanvragen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_meldingen_id_idx" ON "payload_locked_documents_rels" USING btree ("meldingen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_medische_kaart_aanvragen_i_idx" ON "payload_locked_documents_rels" USING btree ("medische_kaart_aanvragen_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_meldingen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_medische_kaart_aanvragen_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_meldingen_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_medische_kaart_aanvragen_i_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "meldingen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "medische_kaart_aanvragen_id";
  DROP TABLE IF EXISTS "meldingen" CASCADE;
  DROP TABLE IF EXISTS "medische_kaart_aanvragen" CASCADE;
  ALTER TABLE "players" DROP COLUMN IF EXISTS "email";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "email_verplicht_vanaf";
  DROP TYPE IF EXISTS "public"."enum_medische_kaart_aanvragen_status";
  DROP TYPE IF EXISTS "public"."enum_medische_kaart_aanvragen_via";`)
}
