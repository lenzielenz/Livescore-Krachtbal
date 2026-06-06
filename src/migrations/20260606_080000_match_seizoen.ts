import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Seizoenveld op wedstrijden + backfill van bestaande rijen uit de datum (juli–juni = "N-N+1").
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "seizoen" varchar;
  UPDATE "matches" SET "seizoen" =
    CASE WHEN EXTRACT(MONTH FROM "date") >= 7
         THEN EXTRACT(YEAR FROM "date")::int::text || '-' || (EXTRACT(YEAR FROM "date")::int + 1)::text
         ELSE (EXTRACT(YEAR FROM "date")::int - 1)::text || '-' || EXTRACT(YEAR FROM "date")::int::text
    END
  WHERE "date" IS NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN "seizoen";`)
}
