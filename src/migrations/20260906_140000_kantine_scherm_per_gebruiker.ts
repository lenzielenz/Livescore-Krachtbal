import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Persoonlijk kantinescherm: elke ingelogde gebruiker stelt zijn eigen tv-scherm samen.
//
// Eén json-kolom op users met { clubIds, teamIds, matchIds } — de club(s) die je heel het seizoen
// automatisch volgt, eventueel losse ploegen, en losse wedstrijden die je erbij koos. Zie
// src/lib/kantine-selectie.ts, dat alles wat hier staat eerst opschoont vóór het scherm ermee
// werkt. Idempotent raw-SQL naar het huis-patroon.
//
// De oude, centrale selectie (settings.kantine_match_ids) blijft staan: er hangen tv's aan
// /kantine/scherm en die mogen midden in het seizoen niet zwart vallen.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kantine_scherm" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN IF EXISTS "kantine_scherm";`)
}
