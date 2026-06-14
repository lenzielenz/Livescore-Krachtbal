import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Bonusrad-booster per gebruiker: de top 3 van het weekend winnen een persoonlijke vermenigvuldiger
// ({ mult, remaining, wonAt }) die ze op hun eigen voorspellingen kunnen plakken.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pronostiek_power" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN IF EXISTS "pronostiek_power";`)
}
