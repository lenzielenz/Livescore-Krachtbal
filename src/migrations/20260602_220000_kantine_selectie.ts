import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Centrale selectie voor het kantinescherm: komma-gescheiden match-ids op de settings-global,
// zodat je op één toestel kiest en het op de kantine-tv verschijnt (zie /kantine).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "settings" ADD COLUMN "kantine_match_ids" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "settings" DROP COLUMN "kantine_match_ids";`)
}
