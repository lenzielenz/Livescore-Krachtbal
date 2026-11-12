import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// RCVK-koppelingen tussen blad, klachten en boetes:
// - forfait vooraf gemeld door de club (item 34): wanneer, door wie, waarom, en het moment
//   (tijdig / laat / ter plaatse) dat de boete bepaalt — matchsheets.forfait_*;
// - voorbehoud en uitsluiting per ploeg (item 25, 27) — side + speeltijd op de bladrijen;
// - een voorbehoud wordt na het indienen een klacht van soort 'voorbehoud' die de club binnen 5
//   werkdagen bekrachtigt of laat varen — klachten.soort/bekrachtig_tegen/relaas/sleutel + statussen;
// - boetelijst: aanleidingen 'voorbehoud' (niet bekrachtigd) en 'verplaatsing' (item 33), het
//   forfaitmoment en de doelgroep (senioren/jeugd).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_boete_soorten_trigger" ADD VALUE IF NOT EXISTS 'voorbehoud';
  ALTER TYPE "public"."enum_boete_soorten_trigger" ADD VALUE IF NOT EXISTS 'verplaatsing';
  ALTER TYPE "public"."enum_klachten_status" ADD VALUE IF NOT EXISTS 'te_bekrachtigen';
  ALTER TYPE "public"."enum_klachten_status" ADD VALUE IF NOT EXISTS 'afgezien';
  ALTER TYPE "public"."enum_klachten_status" ADD VALUE IF NOT EXISTS 'vervallen';

  DO $$ BEGIN
    CREATE TYPE "public"."enum_boete_soorten_forfait_moment" AS ENUM('alle', 'vooraf', 'laat', 'ter_plaatse');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_boete_soorten_doelgroep" AS ENUM('alle', 'senioren', 'jeugd');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_matchsheets_forfait_moment" AS ENUM('vooraf', 'laat', 'ter_plaatse');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_matchsheets_voorbehoud_side" AS ENUM('thuis', 'uit');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_matchsheets_uitsluitingen_side" AS ENUM('thuis', 'uit');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_klachten_soort" AS ENUM('klacht', 'voorbehoud');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  ALTER TABLE "boete_soorten" ADD COLUMN IF NOT EXISTS "forfait_moment" "enum_boete_soorten_forfait_moment" DEFAULT 'alle';
  ALTER TABLE "boete_soorten" ADD COLUMN IF NOT EXISTS "doelgroep" "enum_boete_soorten_doelgroep" DEFAULT 'alle';

  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "forfait_gemeld_op" timestamp(3) with time zone;
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "forfait_gemeld_door_id" integer;
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "forfait_moment" "enum_matchsheets_forfait_moment";
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "forfait_reden" varchar;

  ALTER TABLE "matchsheets_voorbehoud" ADD COLUMN IF NOT EXISTS "speeltijd" varchar;
  ALTER TABLE "matchsheets_voorbehoud" ADD COLUMN IF NOT EXISTS "side" "enum_matchsheets_voorbehoud_side";
  ALTER TABLE "matchsheets_uitsluitingen" ADD COLUMN IF NOT EXISTS "side" "enum_matchsheets_uitsluitingen_side";

  ALTER TABLE "klachten" ADD COLUMN IF NOT EXISTS "soort" "enum_klachten_soort" DEFAULT 'klacht';
  ALTER TABLE "klachten" ADD COLUMN IF NOT EXISTS "bekrachtig_tegen" timestamp(3) with time zone;
  ALTER TABLE "klachten" ADD COLUMN IF NOT EXISTS "relaas" varchar;
  ALTER TABLE "klachten" ADD COLUMN IF NOT EXISTS "sleutel" varchar;

  DO $$ BEGIN
    ALTER TABLE "matchsheets" ADD CONSTRAINT "matchsheets_forfait_gemeld_door_id_users_id_fk" FOREIGN KEY ("forfait_gemeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "matchsheets_forfait_forfait_gemeld_door_idx" ON "matchsheets" USING btree ("forfait_gemeld_door_id");
  CREATE INDEX IF NOT EXISTS "klachten_soort_idx" ON "klachten" USING btree ("soort");
  CREATE INDEX IF NOT EXISTS "klachten_sleutel_idx" ON "klachten" USING btree ("sleutel");`)
}

// De extra enumwaarden (aanleidingen, klachtstatussen) blijven staan: Postgres kan geen waarde uit een
// enum halen zonder het type opnieuw op te bouwen, en ze schaden niet.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" DROP CONSTRAINT IF EXISTS "matchsheets_forfait_gemeld_door_id_users_id_fk";
  DROP INDEX IF EXISTS "matchsheets_forfait_forfait_gemeld_door_idx";
  DROP INDEX IF EXISTS "klachten_soort_idx";
  DROP INDEX IF EXISTS "klachten_sleutel_idx";
  ALTER TABLE "boete_soorten" DROP COLUMN IF EXISTS "forfait_moment";
  ALTER TABLE "boete_soorten" DROP COLUMN IF EXISTS "doelgroep";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "forfait_gemeld_op";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "forfait_gemeld_door_id";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "forfait_moment";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "forfait_reden";
  ALTER TABLE "matchsheets_voorbehoud" DROP COLUMN IF EXISTS "speeltijd";
  ALTER TABLE "matchsheets_voorbehoud" DROP COLUMN IF EXISTS "side";
  ALTER TABLE "matchsheets_uitsluitingen" DROP COLUMN IF EXISTS "side";
  ALTER TABLE "klachten" DROP COLUMN IF EXISTS "soort";
  ALTER TABLE "klachten" DROP COLUMN IF EXISTS "bekrachtig_tegen";
  ALTER TABLE "klachten" DROP COLUMN IF EXISTS "relaas";
  ALTER TABLE "klachten" DROP COLUMN IF EXISTS "sleutel";
  DROP TYPE IF EXISTS "public"."enum_boete_soorten_forfait_moment";
  DROP TYPE IF EXISTS "public"."enum_boete_soorten_doelgroep";
  DROP TYPE IF EXISTS "public"."enum_matchsheets_forfait_moment";
  DROP TYPE IF EXISTS "public"."enum_matchsheets_voorbehoud_side";
  DROP TYPE IF EXISTS "public"."enum_matchsheets_uitsluitingen_side";
  DROP TYPE IF EXISTS "public"."enum_klachten_soort";`)
}
