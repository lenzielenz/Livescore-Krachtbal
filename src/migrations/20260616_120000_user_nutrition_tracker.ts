import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Persoonlijke calorie-tracker per gebruiker: de dagelijkse voedingslog + gewichtsmetingen
// ({ days: {...}, weights: [...] }). Eén jsonb-kolom.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nutrition_tracker" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN IF EXISTS "nutrition_tracker";`)
}
