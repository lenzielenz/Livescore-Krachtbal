import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Vertrouwenslaag op supporters-scores (zie src/lib/score-trust.ts):
//  - matches.score_trust : official scorer van deze wedstrijd + bijdragers + bevestigingen/betwistingen
//  - users.score_trust   : de (onzichtbare) trust-historiek van een aantekenaar
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "score_trust" jsonb;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "score_trust" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "score_trust";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "score_trust";`)
}
