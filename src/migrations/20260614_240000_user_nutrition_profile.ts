import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Persoonlijk voedingsprofiel per gebruiker: de bewaarde gegevens van de voedingsplanner
// (geslacht, leeftijd, lengte, gewicht, activiteit, doel, tempo, macro-stijl, dieet, streefgewicht),
// zodat de gebruiker het niet telkens opnieuw moet invullen. Eén jsonb-kolom.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nutrition_profile" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN IF EXISTS "nutrition_profile";`)
}
