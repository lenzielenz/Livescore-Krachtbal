import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Medisch attest: automatisch goedgekeurd als alles juist staat, anders ter nakijken bij de federatie
// (lib/attest.ts), ook een blanco attest via de publieke link. Een tweede ouder per lid. Het km-tarief van
// de scheidsrechtersvergoeding instelbaar (Settings.kmTarief, € 0,4452). Onafhankelijk van andere migraties.
// Bestaande attesten: "goedgekeurd" (ze golden al).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_medische_attesten_status" AS ENUM('goedgekeurd', 'nakijken', 'afgekeurd');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_medische_attesten_via" AS ENUM('federatie', 'club', 'lid', 'publiek');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "status" "enum_medische_attesten_status" DEFAULT 'goedgekeurd';
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "reden" varchar;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "via" "enum_medische_attesten_via";
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "blanco" boolean DEFAULT false;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "keuring_op" timestamp(3) with time zone;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "opgegeven" jsonb;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "afkeur_reden" varchar;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "beoordeeld_door_id" integer;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "beoordeeld_op" timestamp(3) with time zone;
  DO $$ BEGIN
    ALTER TABLE "medische_attesten" ADD CONSTRAINT "medische_attesten_beoordeeld_door_id_users_id_fk" FOREIGN KEY ("beoordeeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "medische_attesten_status_idx" ON "medische_attesten" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "medische_attesten_beoordeeld_door_idx" ON "medische_attesten" USING btree ("beoordeeld_door_id");
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "ouder2_email" varchar;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "km_tarief" numeric DEFAULT 0.4452;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "medische_attesten" DROP CONSTRAINT IF EXISTS "medische_attesten_beoordeeld_door_id_users_id_fk";
  DROP INDEX IF EXISTS "medische_attesten_status_idx";
  DROP INDEX IF EXISTS "medische_attesten_beoordeeld_door_idx";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "status";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "reden";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "via";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "blanco";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "keuring_op";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "opgegeven";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "afkeur_reden";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "beoordeeld_door_id";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "beoordeeld_op";
  DROP TYPE IF EXISTS "public"."enum_medische_attesten_status";
  DROP TYPE IF EXISTS "public"."enum_medische_attesten_via";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "ouder2_email";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "km_tarief";`)
}
