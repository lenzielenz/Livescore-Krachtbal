import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tornooidag-groepen: meerdere reeksen ("Beker van Brugge U12" … "… Heren") bundelen onder één
// hoofdgroep met één publieke groepspagina en één zelfaanpassend kantinescherm. Wedstrijden
// krijgen een gepland aanvangsuur zodat het kantinescherm kan aftellen naar wat komt.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "groep" varchar;
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "planned_at" timestamp(3) with time zone;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "tournaments_groep_idx" ON "tournaments" USING btree ("groep");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "tournaments_groep_idx";
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "groep";
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "planned_at";`)
}
