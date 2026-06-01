import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "matchsheets" ADD COLUMN "officials_aantekenaar" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "officials_tijdopnemer" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "officials_grensrechter_thuis" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "officials_grensrechter_uit" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "officials_terreinafgevaardigde" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "officials_coach_thuis" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "officials_coach_uit" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "matchsheets" DROP COLUMN "officials_aantekenaar";
  ALTER TABLE "matchsheets" DROP COLUMN "officials_tijdopnemer";
  ALTER TABLE "matchsheets" DROP COLUMN "officials_grensrechter_thuis";
  ALTER TABLE "matchsheets" DROP COLUMN "officials_grensrechter_uit";
  ALTER TABLE "matchsheets" DROP COLUMN "officials_terreinafgevaardigde";
  ALTER TABLE "matchsheets" DROP COLUMN "officials_coach_thuis";
  ALTER TABLE "matchsheets" DROP COLUMN "officials_coach_uit";`)
}
