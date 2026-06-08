import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// "Mijn ploegen": een trainer/coach duidt aan welke ploeg(en) van zijn club de zijne zijn, zodat
// de selectie op "Mijn club" al gebeurd is (gefocust op zijn ploegen). Eén jsonb-kolom met team-ids.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN "my_teams" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN "my_teams";`)
}
