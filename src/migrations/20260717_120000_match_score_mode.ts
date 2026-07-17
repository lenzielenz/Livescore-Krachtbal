import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Livescore losgekoppeld van de federatie: per wedstrijd kiezen wie aantekent.
//  - 'federatie' (standaard): de volledige flow (opstelling + scheidsrechtersakkoord + aftekenen).
//  - 'supporters': vrije livescore — de scheidsrechterflow valt weg en iedereen kan de score
//    van die wedstrijd doorgeven. Handig bij een geïmporteerde agenda.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_matches_score_mode" AS ENUM('federatie', 'supporters');
  ALTER TABLE "matches" ADD COLUMN "score_mode" "enum_matches_score_mode" DEFAULT 'federatie' NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN "score_mode";
  DROP TYPE "public"."enum_matches_score_mode";`)
}
