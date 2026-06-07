import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Eigenaar van een analyse-opname: de gebruiker die de (analyseOnly) wedstrijd opnam. Analyse-data
// is privé per persoon — federatie/admin ziet alles. Verwijst naar users (op verwijderde gebruiker
// → null), zoals home_coach/away_coach.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "analyse_owner_id" integer;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_analyse_owner_id_users_id_fk" FOREIGN KEY ("analyse_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matches_analyse_owner_idx" ON "matches" USING btree ("analyse_owner_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "matches_analyse_owner_idx";
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_analyse_owner_id_users_id_fk";
  ALTER TABLE "matches" DROP COLUMN "analyse_owner_id";`)
}
