import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Ouders van jeugdspelers: het e-mailadres van de ouder bij de speler, de kinderen bij het account
// (users_rels.players_id) en de aanvraagbron "ouder" voor een medische kaart. Zie lib/ouders.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Een nieuwe enumwaarde in een eigen statement (Postgres kan ze niet in dezelfde transactie-batch gebruiken).
  await db.execute(sql`ALTER TYPE "public"."enum_medische_kaart_aanvragen_via" ADD VALUE IF NOT EXISTS 'ouder';`)
  await db.execute(sql`
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "ouder_email" varchar;
  ALTER TABLE "users_rels" ADD COLUMN IF NOT EXISTS "players_id" integer;
  DO $$ BEGIN
    ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_players_fk" FOREIGN KEY ("players_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "users_rels_players_id_idx" ON "users_rels" USING btree ("players_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // De enumwaarde 'ouder' blijft staan: Postgres kan geen waarde uit een enum halen.
  await db.execute(sql`
  ALTER TABLE "users_rels" DROP CONSTRAINT IF EXISTS "users_rels_players_fk";
  DROP INDEX IF EXISTS "users_rels_players_id_idx";
  ALTER TABLE "users_rels" DROP COLUMN IF EXISTS "players_id";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "ouder_email";`)
}
