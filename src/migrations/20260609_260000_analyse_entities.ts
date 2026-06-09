import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Analyse-eigen clubs/ploegen/spelers: dezelfde tabellen als de competitie, maar afgeschermd via
// twee velden (spiegel van matches.analyse_only + matches.analyse_owner_id). analyse_only verbergt
// de entiteit voor de competitie; analyse_owner_id koppelt ze privé aan de analist die ze aanmaakte.
// Zo bouwt elke analyse-gebruiker zijn eigen, losstaande database zonder de competitie te raken.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" ADD COLUMN "analyse_only" boolean DEFAULT false;
  ALTER TABLE "clubs" ADD COLUMN "analyse_owner_id" integer;
  ALTER TABLE "clubs" ADD CONSTRAINT "clubs_analyse_owner_id_users_id_fk" FOREIGN KEY ("analyse_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "clubs_analyse_owner_idx" ON "clubs" USING btree ("analyse_owner_id");

  ALTER TABLE "teams" ADD COLUMN "analyse_only" boolean DEFAULT false;
  ALTER TABLE "teams" ADD COLUMN "analyse_owner_id" integer;
  ALTER TABLE "teams" ADD CONSTRAINT "teams_analyse_owner_id_users_id_fk" FOREIGN KEY ("analyse_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "teams_analyse_owner_idx" ON "teams" USING btree ("analyse_owner_id");

  ALTER TABLE "players" ADD COLUMN "analyse_only" boolean DEFAULT false;
  ALTER TABLE "players" ADD COLUMN "analyse_owner_id" integer;
  ALTER TABLE "players" ADD CONSTRAINT "players_analyse_owner_id_users_id_fk" FOREIGN KEY ("analyse_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "players_analyse_owner_idx" ON "players" USING btree ("analyse_owner_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "players_analyse_owner_idx";
  ALTER TABLE "players" DROP CONSTRAINT IF EXISTS "players_analyse_owner_id_users_id_fk";
  ALTER TABLE "players" DROP COLUMN "analyse_owner_id";
  ALTER TABLE "players" DROP COLUMN "analyse_only";

  DROP INDEX IF EXISTS "teams_analyse_owner_idx";
  ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_analyse_owner_id_users_id_fk";
  ALTER TABLE "teams" DROP COLUMN "analyse_owner_id";
  ALTER TABLE "teams" DROP COLUMN "analyse_only";

  DROP INDEX IF EXISTS "clubs_analyse_owner_idx";
  ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "clubs_analyse_owner_id_users_id_fk";
  ALTER TABLE "clubs" DROP COLUMN "analyse_owner_id";
  ALTER TABLE "clubs" DROP COLUMN "analyse_only";`)
}
