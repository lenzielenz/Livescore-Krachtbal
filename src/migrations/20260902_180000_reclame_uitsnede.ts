import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Bijsnijden van een reclamebeeld: zoom, verschuiving, draaiing en de achtergrond van de tegel.
//
// Reclame komt binnen zoals ze binnenkomt — een liggende banner, een vierkant logo, een foto van
// een sponsorbord die scheef genomen is. Zonder deze velden staat dat allemaal ongecorrigeerd in
// dezelfde balk. De beheerder zet het recht in de admin (zie components/admin/ReclameFitEditor);
// de waarden hier zijn wat het scherm daarna toepast (lib/reclame.ts).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "advertenties" ADD COLUMN IF NOT EXISTS "zoom" numeric DEFAULT 1;
  ALTER TABLE "advertenties" ADD COLUMN IF NOT EXISTS "offset_x" numeric DEFAULT 0;
  ALTER TABLE "advertenties" ADD COLUMN IF NOT EXISTS "offset_y" numeric DEFAULT 0;
  ALTER TABLE "advertenties" ADD COLUMN IF NOT EXISTS "rotatie" numeric DEFAULT 0;
  ALTER TABLE "advertenties" ADD COLUMN IF NOT EXISTS "achtergrond" varchar DEFAULT 'donker';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "advertenties" DROP COLUMN IF EXISTS "zoom";
  ALTER TABLE "advertenties" DROP COLUMN IF EXISTS "offset_x";
  ALTER TABLE "advertenties" DROP COLUMN IF EXISTS "offset_y";
  ALTER TABLE "advertenties" DROP COLUMN IF EXISTS "rotatie";
  ALTER TABLE "advertenties" DROP COLUMN IF EXISTS "achtergrond";`)
}
