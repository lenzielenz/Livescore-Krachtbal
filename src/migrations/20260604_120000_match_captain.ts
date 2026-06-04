import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Kapitein per ploeg op de wedstrijd (één van de veldspelers). Reglement: een eigen
// doelpunt wordt op naam/nummer van de kapitein genoteerd. Aangeduid bij de opstelling.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "home_captain_id" integer;
  ALTER TABLE "matches" ADD COLUMN "away_captain_id" integer;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_home_captain_id_players_id_fk" FOREIGN KEY ("home_captain_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_away_captain_id_players_id_fk" FOREIGN KEY ("away_captain_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matches_home_captain_idx" ON "matches" USING btree ("home_captain_id");
  CREATE INDEX "matches_away_captain_idx" ON "matches" USING btree ("away_captain_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "matches_home_captain_idx";
  DROP INDEX IF EXISTS "matches_away_captain_idx";
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_home_captain_id_players_id_fk";
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_away_captain_id_players_id_fk";
  ALTER TABLE "matches" DROP COLUMN "home_captain_id";
  ALTER TABLE "matches" DROP COLUMN "away_captain_id";`)
}
