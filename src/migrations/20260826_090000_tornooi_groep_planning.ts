import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tornooidag-groepen: meerdere reeksen ("Beker van Brugge U12" … "… Heren") bundelen onder één
// hoofdgroep met één publieke groepspagina en één zelfaanpassend kantinescherm. Wedstrijden
// krijgen een gepland aanvangsuur zodat het kantinescherm kan aftellen naar wat komt.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "groep" varchar;
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "host_club_id" integer;
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "planned_at" timestamp(3) with time zone;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "tournaments_groep_idx" ON "tournaments" USING btree ("groep");
  DO $$ BEGIN
    ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_host_club_id_clubs_id_fk" FOREIGN KEY ("host_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "tournaments_host_club_idx" ON "tournaments" USING btree ("host_club_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "tournaments_groep_idx";
  DROP INDEX IF EXISTS "tournaments_host_club_idx";
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "groep";
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "host_club_id";
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "planned_at";`)
}
