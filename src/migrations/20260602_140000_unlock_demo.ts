import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Demo-/oefenwedstrijd (matches.is_demo) + scheidsrechtersakkoord vóór de start
// (matchsheets.wedstrijdstart_*). Samen sturen ze de ontgrendeling van het
// aantekenscherm aan — zie src/lib/match-readiness.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "is_demo" boolean DEFAULT false;
  ALTER TABLE "matchsheets" ADD COLUMN "wedstrijdstart_akkoord" boolean DEFAULT false;
  ALTER TABLE "matchsheets" ADD COLUMN "wedstrijdstart_naam" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "wedstrijdstart_tijdstip" timestamp(3) with time zone;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN "is_demo";
  ALTER TABLE "matchsheets" DROP COLUMN "wedstrijdstart_akkoord";
  ALTER TABLE "matchsheets" DROP COLUMN "wedstrijdstart_naam";
  ALTER TABLE "matchsheets" DROP COLUMN "wedstrijdstart_tijdstip";`)
}
