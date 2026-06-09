import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Robuuste herstel-migratie voor de spelerpositie-enum. De eerdere migratie
// (20260608_160000_player_wing) voegde 'vleugel-links'/'vleugel-rechts' toe in ÉÉN
// multi-statement db.execute; voor `ALTER TYPE ... ADD VALUE` kan dat in een (impliciete)
// transactie mislukken, waardoor de waarden op productie ontbreken en het bewaren van een speler
// met die positie faalt ("An unknown error has occurred"). We voegen ze hier opnieuw toe, elk in
// een aparte statement en idempotent (IF NOT EXISTS) — zo is het een no-op als ze al bestaan.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TYPE "public"."enum_players_position" ADD VALUE IF NOT EXISTS 'vleugel-links'`)
  await db.execute(sql`ALTER TYPE "public"."enum_players_position" ADD VALUE IF NOT EXISTS 'vleugel-rechts'`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Een enum-waarde verwijderen vereist het hele type te herbouwen; we laten de waarden bewust staan.
}
