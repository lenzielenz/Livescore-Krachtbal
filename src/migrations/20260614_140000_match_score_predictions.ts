import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Clubcompetitie 'voorspel de uitslag': bewaar de exacte-uitslag-voorspellingen van clubleden op de
// wedstrijd ([{userId,name,clubId,home,away,at}]). Eén json-kolom; het seizoensklassement wordt
// hieruit afgeleid.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "score_predictions" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "score_predictions";`)
}
