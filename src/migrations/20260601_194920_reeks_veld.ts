import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_teams_reeks" AS ENUM('1NAH', '1NAHB', '1NAD', '2NAH', '2NAHB', 'LH', 'LD', 'RHA', 'RHB', 'RDA', 'RDB', 'U18J', 'U18M', 'U16J', 'U16M', 'U14J', 'U14M', 'U12', 'recreatief', 'beker', 'andere');
  CREATE TYPE "public"."enum_matches_reeks" AS ENUM('1NAH', '1NAHB', '1NAD', '2NAH', '2NAHB', 'LH', 'LD', 'RHA', 'RHB', 'RDA', 'RDB', 'U18J', 'U18M', 'U16J', 'U16M', 'U14J', 'U14M', 'U12', 'recreatief', 'beker', 'andere');
  ALTER TABLE "teams" ADD COLUMN "reeks" "enum_teams_reeks";
  ALTER TABLE "matches" ADD COLUMN "reeks" "enum_matches_reeks";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "teams" DROP COLUMN "reeks";
  ALTER TABLE "matches" DROP COLUMN "reeks";
  DROP TYPE "public"."enum_teams_reeks";
  DROP TYPE "public"."enum_matches_reeks";`)
}
