import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Hoogste live-kijkersaantal tijdens de wedstrijd (match-channel.ts) — bewaard zodat de
// samenvatting erna nog weet hoeveel mensen meekeken, ook nadat het live-kanaal zelf al lang
// opgeruimd is. Zie collections/Matches.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "peak_viewers" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "peak_viewers";`)
}
