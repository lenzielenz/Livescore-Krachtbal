import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Locatie van de thuisclub (gemeente + optionele exacte coördinaten) voor de buienradar per
// wedstrijd. plaats = tekst (geocoderen), lat/lng = numeriek (optioneel, nauwkeuriger).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" ADD COLUMN "plaats" varchar;
  ALTER TABLE "clubs" ADD COLUMN "lat" numeric;
  ALTER TABLE "clubs" ADD COLUMN "lng" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" DROP COLUMN "plaats";
  ALTER TABLE "clubs" DROP COLUMN "lat";
  ALTER TABLE "clubs" DROP COLUMN "lng";`)
}
