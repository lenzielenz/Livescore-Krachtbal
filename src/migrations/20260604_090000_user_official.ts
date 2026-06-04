import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Koppelt een gebruiker (scheidsrechter-account) aan zijn/haar officialdossier, zodat hij enkel
// z'n EIGEN kwitantie/forfaitblad kan ophalen en enkel toegewezen wedstrijden kan tekenen
// (voorkomt IDOR op financiële PII — AUDIT-2026-06.md §4/§5).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN "official_id" integer;
  ALTER TABLE "users" ADD CONSTRAINT "users_official_id_officials_id_fk" FOREIGN KEY ("official_id") REFERENCES "public"."officials"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_official_idx" ON "users" USING btree ("official_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "users_official_idx";
  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_official_id_officials_id_fk";
  ALTER TABLE "users" DROP COLUMN "official_id";`)
}
