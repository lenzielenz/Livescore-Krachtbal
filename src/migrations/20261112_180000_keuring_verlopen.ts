import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Ledenregister: wat een verlopen medische keuring (365 dagen) doet in de opstelling — waarschuwen
// (standaard) of blokkeren. De federatie kiest (globals/Settings.ts, lib/lineup.ts). Onafhankelijk van
// andere migraties: Railway draait ze niet gegarandeerd in volgorde van naam.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_settings_keuring_verlopen" AS ENUM('waarschuwen', 'blokkeren');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "keuring_verlopen" "enum_settings_keuring_verlopen" DEFAULT 'waarschuwen';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "keuring_verlopen";
  DROP TYPE IF EXISTS "public"."enum_settings_keuring_verlopen";`)
}
