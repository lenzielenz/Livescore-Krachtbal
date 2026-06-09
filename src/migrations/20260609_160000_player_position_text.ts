import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Definitieve oplossing voor het bewaren van een spelerpositie op Postgres. De kolom was een enum
// (enum_players_position); ontbrak een waarde (bv. 'vleugel-rechts') in de DB, dan weigerde Postgres
// het bewaren ("An unknown error" / 400). We zetten de kolom om naar gewone tekst, zodat elke door
// het formulier toegelaten positie altijd bewaard kan worden. Payload blijft de waarde valideren
// tegen de keuzelijst, dus de toegelaten set blijft hetzelfde — enkel de DB is niet langer streng.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "players" ALTER COLUMN "position" TYPE text USING "position"::text`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Best effort terug naar de enum (kan falen als er waarden buiten de enum staan).
  await db.execute(
    sql`ALTER TABLE "players" ALTER COLUMN "position" TYPE "public"."enum_players_position" USING "position"::"public"."enum_players_position"`,
  )
}
