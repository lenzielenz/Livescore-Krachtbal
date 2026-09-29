import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Video's toevoegen aan de foto-tribune: 'kind' onderscheidt een foto- van een video-instant
// (dezelfde upload-collectie, dezelfde moderatie). Bestaande rijen zijn allemaal foto's.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_match_instants_kind" AS ENUM('photo', 'video');
  ALTER TABLE "match_instants" ADD COLUMN IF NOT EXISTS "kind" "enum_match_instants_kind" DEFAULT 'photo' NOT NULL;
  CREATE INDEX "match_instants_kind_idx" ON "match_instants" USING btree ("kind");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "match_instants_kind_idx";
  ALTER TABLE "match_instants" DROP COLUMN IF EXISTS "kind";
  DROP TYPE IF EXISTS "public"."enum_match_instants_kind";`)
}
