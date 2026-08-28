import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Pronostiek op tornooiwedstrijden: supporters voorspellen de uitslag; zelfde opslagvorm en
// puntensysteem als de competitie-pronostiek (scorePredictions-json op de wedstrijd).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "score_predictions" jsonb DEFAULT '[]'::jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "score_predictions";`)
}
