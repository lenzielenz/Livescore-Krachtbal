import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Speler krijgt een expliciete club, zodat je bij het toevoegen eerst de club kiest en daarna de
// ploeg (gefilterd op die club). Bestaande spelers krijgen hun club uit de gekoppelde ploeg, zodat
// ze geldig blijven en het bewerken niet breekt. Teams krijgen een display_title-kolom: de titel
// "naam — reeks" wordt bij het lezen berekend, maar de kolom moet bestaan (niet-virtueel veld).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "display_title" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "club_id" integer;
  ALTER TABLE "players" ADD CONSTRAINT "players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "players_club_idx" ON "players" USING btree ("club_id");
  UPDATE "players" SET "club_id" = "teams"."club_id" FROM "teams" WHERE "teams"."id" = "players"."team_id" AND "players"."club_id" IS NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "players_club_idx";
  ALTER TABLE "players" DROP CONSTRAINT IF EXISTS "players_club_id_clubs_id_fk";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "club_id";
  ALTER TABLE "teams" DROP COLUMN IF EXISTS "display_title";`)
}
