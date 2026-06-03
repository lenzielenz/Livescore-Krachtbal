import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Centrale selectie voor het veldscherm: één match-id op de settings-global, zodat je vanaf
// de cast-pagina de wedstrijd op de veld-tv wisselt zonder de tv aan te raken (zie /cast).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "settings" ADD COLUMN "veld_match_id" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "settings" DROP COLUMN "veld_match_id";`)
}
