import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "matches" ALTER COLUMN "category" DROP NOT NULL;
  UPDATE "matches" SET "reeks" = 'andere' WHERE "reeks" IS NULL;
  ALTER TABLE "matches" ALTER COLUMN "reeks" SET NOT NULL;
  ALTER TABLE "clubs" ADD COLUMN "accommodatie" varchar;
  ALTER TABLE "clubs" ADD COLUMN "telefoon" varchar;
  ALTER TABLE "clubs" ADD COLUMN "website" varchar;
  ALTER TABLE "clubs" ADD COLUMN "secretaris_naam" varchar;
  ALTER TABLE "clubs" ADD COLUMN "secretaris_email" varchar;
  ALTER TABLE "clubs" ADD COLUMN "secretaris_telefoon" varchar;
  ALTER TABLE "clubs" ADD COLUMN "jeugd_naam" varchar;
  ALTER TABLE "clubs" ADD COLUMN "jeugd_email" varchar;
  ALTER TABLE "clubs" ADD COLUMN "jeugd_telefoon" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "matches" ALTER COLUMN "reeks" DROP NOT NULL;
  UPDATE "matches" SET "category" = 'senioren' WHERE "category" IS NULL;
  ALTER TABLE "matches" ALTER COLUMN "category" SET NOT NULL;
  ALTER TABLE "clubs" DROP COLUMN "accommodatie";
  ALTER TABLE "clubs" DROP COLUMN "telefoon";
  ALTER TABLE "clubs" DROP COLUMN "website";
  ALTER TABLE "clubs" DROP COLUMN "secretaris_naam";
  ALTER TABLE "clubs" DROP COLUMN "secretaris_email";
  ALTER TABLE "clubs" DROP COLUMN "secretaris_telefoon";
  ALTER TABLE "clubs" DROP COLUMN "jeugd_naam";
  ALTER TABLE "clubs" DROP COLUMN "jeugd_email";
  ALTER TABLE "clubs" DROP COLUMN "jeugd_telefoon";`)
}
