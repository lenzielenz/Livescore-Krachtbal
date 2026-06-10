import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Vervangingen (wissels) als wedstrijdgebeurtenis: nieuw event-type 'substitution'. Wie eruit/erin
// ging staat leesbaar in het bestaande note-veld — geen nieuwe kolommen nodig.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_match_events_type" ADD VALUE IF NOT EXISTS 'substitution';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // PostgreSQL kan een enum-waarde niet verwijderen; bestaande 'substitution'-events blijven
  // gewoon staan. Bewust een no-op.
}
