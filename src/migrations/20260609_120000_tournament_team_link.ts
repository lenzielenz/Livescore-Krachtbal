import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tornooi-aantekentafel = het gewone aantekenblad. Daarvoor koppelen we tornooiploegen aan echte
// ploegen (tournaments.team_teams: [{ name, teamId }]) zodat de echte spelerslijst geladen kan
// worden (scorerkeuze + wissels). Daarnaast krijgt elke tornooiwedstrijd een teller voor
// scheidsrechter-minuten, net als een gewone wedstrijd.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "team_teams" jsonb;
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "referee_stops" numeric DEFAULT 0;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "team_teams";
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "referee_stops";`)
}
