import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Aangeduide verantwoordelijke (coach/aantekenaar) per club op een wedstrijd. Een clublid
// "claimt" de wedstrijd via Mijn club, zodat de hele club ziet wie waar staat. Thuis en
// bezoek apart; verwijst naar users (op verwijderde gebruiker → null).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "home_coach_id" integer;
  ALTER TABLE "matches" ADD COLUMN "away_coach_id" integer;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_home_coach_id_users_id_fk" FOREIGN KEY ("home_coach_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_away_coach_id_users_id_fk" FOREIGN KEY ("away_coach_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matches_home_coach_idx" ON "matches" USING btree ("home_coach_id");
  CREATE INDEX "matches_away_coach_idx" ON "matches" USING btree ("away_coach_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "matches_home_coach_idx";
  DROP INDEX IF EXISTS "matches_away_coach_idx";
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_home_coach_id_users_id_fk";
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_away_coach_id_users_id_fk";
  ALTER TABLE "matches" DROP COLUMN "home_coach_id";
  ALTER TABLE "matches" DROP COLUMN "away_coach_id";`)
}
