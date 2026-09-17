import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Gevolgde clubs (nieuw veld `followedClubs`, hasMany naar clubs) op users: de eerste hasMany-
// relatie op users die naar clubs wijst (de bestaande `club` is enkelvoudig en heeft dus een eigen
// FK-kolom, geen rels-rij). users_rels bestond al (zie 20260610_200000_analyse_delen) maar had nog
// geen kolom om naar clubs te verwijzen — die voegen we hier toe, zelfde vorm als de andere
// *_rels-uitbreidingen (bv. 20260828_150000_tornooi_fotos_lock_rel).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users_rels" ADD COLUMN IF NOT EXISTS "clubs_id" integer;
  DO $$ BEGIN
    ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_clubs_fk" FOREIGN KEY ("clubs_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "users_rels_clubs_id_idx" ON "users_rels" USING btree ("clubs_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users_rels" DROP CONSTRAINT IF EXISTS "users_rels_clubs_fk";
  DROP INDEX IF EXISTS "users_rels_clubs_id_idx";
  ALTER TABLE "users_rels" DROP COLUMN IF EXISTS "clubs_id";`)
}
