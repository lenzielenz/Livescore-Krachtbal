import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Clubkleuren (primair + secundair, hex). Worden uit het logo afgeleid en handmatig
// bijgesteld; de live-weergaven bouwen er hun dynamische stijl op.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clubs" ADD COLUMN "color_primary" varchar;
  ALTER TABLE "clubs" ADD COLUMN "color_secondary" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clubs" DROP COLUMN "color_primary";
  ALTER TABLE "clubs" DROP COLUMN "color_secondary";`)
}
