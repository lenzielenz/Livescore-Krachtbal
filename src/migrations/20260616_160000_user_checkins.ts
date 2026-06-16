import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// "Ik ben erbij": de wedstrijden die een supporter bijwoonde (voedt het seizoenspaspoort). Eén jsonb-kolom.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "checkins" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN IF EXISTS "checkins";`)
}
