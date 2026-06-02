import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Weergave-instelling voor het clublogo: zoom + positie binnen de ronde badge,
// zodat detail-/wapenschildlogo's (bv. Sint-Michiels) de badge mooi vullen.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clubs" ADD COLUMN "logo_zoom" numeric DEFAULT 1;
  ALTER TABLE "clubs" ADD COLUMN "logo_offset_x" numeric DEFAULT 0;
  ALTER TABLE "clubs" ADD COLUMN "logo_offset_y" numeric DEFAULT 0;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clubs" DROP COLUMN "logo_zoom";
  ALTER TABLE "clubs" DROP COLUMN "logo_offset_x";
  ALTER TABLE "clubs" DROP COLUMN "logo_offset_y";`)
}
