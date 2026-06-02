import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Beveiligd groen licht: per-wedstrijd vrijgavecode + backup-scheidsrechter op het blad.
// De (backup-)SR geeft groen licht met de code; federatie/admin kan altijd.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" ADD COLUMN "vrijgave_code" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN "backup_referee_id" integer;
  ALTER TABLE "matchsheets" ADD CONSTRAINT "matchsheets_backup_referee_id_officials_id_fk" FOREIGN KEY ("backup_referee_id") REFERENCES "public"."officials"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matchsheets_backup_referee_idx" ON "matchsheets" USING btree ("backup_referee_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "matchsheets_backup_referee_idx";
  ALTER TABLE "matchsheets" DROP CONSTRAINT IF EXISTS "matchsheets_backup_referee_id_officials_id_fk";
  ALTER TABLE "matchsheets" DROP COLUMN "backup_referee_id";
  ALTER TABLE "matchsheets" DROP COLUMN "vrijgave_code";`)
}
