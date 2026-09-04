import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Vertrouwenslaag op tornooiwedstrijden: supporters mogen in supporters-modus ook een
// tornooiwedstrijd meetellen, en dan hoort er — net als bij een gewone wedstrijd — bij te staan
// wie de stand doorgeeft en of andere kijkers ze bevestigen. Zelfde vorm als matches.score_trust
// (zie src/lib/score-trust.ts); idempotent raw-SQL naar het huis-patroon.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "score_trust" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "score_trust";`)
}
