import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// De pass (§6.10): spelers geven de bal zijwaarts of achterwaarts door vóór een worp. Dat verbruikt
// géén werpbeurt maar verlegt wél de werpplaats — en een voorwaartse pass is een fout (Item 14.10).
//
// Een pass is een gebeurtenis binnen een balbezit, dus hij hoort bij match_events: een nieuw type
// plus de velden die enkel een pass gebruikt (balbezit, vanger, plaats, fout, na hoeveel worpen).
// Zo blijft de worp-collection zuiver: alleen worpen tellen mee voor de worpteller.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_match_events_type" ADD VALUE IF NOT EXISTS 'pass';
  ALTER TYPE "public"."enum_possessions_end_outcome" ADD VALUE IF NOT EXISTS 'pass_fault';
  ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "possession_id" integer;
  ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "player_id" integer;
  ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "x" numeric;
  ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "y" numeric;
  ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "forward" boolean DEFAULT false;
  ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "after_throws" numeric;`)

  // Foreign keys + indexen apart: op een bestaande database mogen ze al bestaan.
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "match_events" ADD CONSTRAINT "match_events_possession_id_possessions_id_fk" FOREIGN KEY ("possession_id") REFERENCES "public"."possessions"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "match_events_possession_idx" ON "match_events" USING btree ("possession_id");
  CREATE INDEX IF NOT EXISTS "match_events_player_idx" ON "match_events" USING btree ("player_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Postgres kan geen enum-waarde verwijderen; de pass-gebeurtenissen zelf gaan wel weg.
  await db.execute(sql`
  DELETE FROM "match_events" WHERE "type" = 'pass';
  UPDATE "possessions" SET "end_outcome" = 'throws_exhausted' WHERE "end_outcome" = 'pass_fault';
  DROP INDEX IF EXISTS "match_events_possession_idx";
  DROP INDEX IF EXISTS "match_events_player_idx";
  ALTER TABLE "match_events" DROP CONSTRAINT IF EXISTS "match_events_possession_id_possessions_id_fk";
  ALTER TABLE "match_events" DROP CONSTRAINT IF EXISTS "match_events_player_id_players_id_fk";
  ALTER TABLE "match_events" DROP COLUMN IF EXISTS "possession_id";
  ALTER TABLE "match_events" DROP COLUMN IF EXISTS "player_id";
  ALTER TABLE "match_events" DROP COLUMN IF EXISTS "x";
  ALTER TABLE "match_events" DROP COLUMN IF EXISTS "y";
  ALTER TABLE "match_events" DROP COLUMN IF EXISTS "forward";
  ALTER TABLE "match_events" DROP COLUMN IF EXISTS "after_throws";`)
}
