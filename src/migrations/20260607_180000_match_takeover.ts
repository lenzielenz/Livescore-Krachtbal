import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Overname-aanvraag per kant: wie vraagt om de claim (verantwoordelijke) over te nemen via
// Mijn club. De huidige verantwoordelijke keurt de aanvraag goed of weigert ze. Verwijst naar
// users (op verwijderde gebruiker → null), zoals home_coach/away_coach.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "home_takeover_id" integer;
  ALTER TABLE "matches" ADD COLUMN "away_takeover_id" integer;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_home_takeover_id_users_id_fk" FOREIGN KEY ("home_takeover_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_away_takeover_id_users_id_fk" FOREIGN KEY ("away_takeover_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matches_home_takeover_idx" ON "matches" USING btree ("home_takeover_id");
  CREATE INDEX "matches_away_takeover_idx" ON "matches" USING btree ("away_takeover_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "matches_home_takeover_idx";
  DROP INDEX IF EXISTS "matches_away_takeover_idx";
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_home_takeover_id_users_id_fk";
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_away_takeover_id_users_id_fk";
  ALTER TABLE "matches" DROP COLUMN "home_takeover_id";
  ALTER TABLE "matches" DROP COLUMN "away_takeover_id";`)
}
