import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Privé-pronostiekpools per club: leden kunnen binnen een ploeg/reeks een eigen pronostiekje met
// apart klassement starten. Opgeslagen als één json-kolom op de club ([{id,name,scope,ownerId,
// members,code,seizoen,createdAt}]).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "pronostiek_pools" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" DROP COLUMN IF EXISTS "pronostiek_pools";`)
}
