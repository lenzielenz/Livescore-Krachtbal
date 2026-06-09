import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Koppel een official-dossier (scheidsrechter, ...) aan een gebruikersaccount, vanuit de
// Officials-kant. Zo weet de federatie wie de official is en ziet die persoon z'n toegewezen
// wedstrijden + persoonlijke QR in het portaal. De omgekeerde koppeling (users.official) wordt
// door een afterChange-hook op Officials in sync gehouden.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "officials" ADD COLUMN IF NOT EXISTS "user_id" integer;
  ALTER TABLE "officials" ADD CONSTRAINT "officials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "officials_user_idx" ON "officials" USING btree ("user_id");
  UPDATE "officials" SET "user_id" = "users"."id" FROM "users" WHERE "users"."official_id" = "officials"."id" AND "officials"."user_id" IS NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "officials_user_idx";
  ALTER TABLE "officials" DROP CONSTRAINT IF EXISTS "officials_user_id_users_id_fk";
  ALTER TABLE "officials" DROP COLUMN IF EXISTS "user_id";`)
}
