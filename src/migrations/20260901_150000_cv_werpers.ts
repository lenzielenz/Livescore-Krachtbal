import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// De toewijzing van werper-volgnummer naar speler: { "3": 42, "7": 43 }.
//
// Het model leest geen rugnummers van truitjes, maar het volgt wel dezelfde persoon zolang die
// in beeld blijft. Deze tabel is wat een mens daaraan toevoegt — één keer per werper in plaats
// van één keer per worp.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cv_werpers" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "matches" DROP COLUMN IF EXISTS "cv_werpers";`)
}
