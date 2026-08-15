import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Seizoen 2026-2027: de federatie voegt een derde regionale herenreeks toe (REGHC → 'RHC') en
// splitst U12, U16 Meisjes en U14 Jongens voor het eerst in poule A/B, elk met een eigen
// rangschikking (zie reeksen.ts). De bestaande ongesplitste waarden ('U12', 'U16M', 'U14J')
// blijven bewust bestaan: oudere seizoenen en bestaande ploegen verwijzen er nog naar.
//
// `ALTER TYPE ... ADD VALUE` moet elk in een eigen statement staan — één multi-statement
// db.execute() liet in een eerdere migratie (20260608_160000_player_wing) de waarden op
// productie ontbreken (zie 20260609_140000_player_position_enum_fix.ts). IF NOT EXISTS maakt
// elke regel idempotent.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TYPE "public"."enum_teams_reeks" ADD VALUE IF NOT EXISTS 'RHC'`)
  await db.execute(sql`ALTER TYPE "public"."enum_teams_reeks" ADD VALUE IF NOT EXISTS 'U12A'`)
  await db.execute(sql`ALTER TYPE "public"."enum_teams_reeks" ADD VALUE IF NOT EXISTS 'U12B'`)
  await db.execute(sql`ALTER TYPE "public"."enum_teams_reeks" ADD VALUE IF NOT EXISTS 'U14JA'`)
  await db.execute(sql`ALTER TYPE "public"."enum_teams_reeks" ADD VALUE IF NOT EXISTS 'U14JB'`)
  await db.execute(sql`ALTER TYPE "public"."enum_teams_reeks" ADD VALUE IF NOT EXISTS 'U16MA'`)
  await db.execute(sql`ALTER TYPE "public"."enum_teams_reeks" ADD VALUE IF NOT EXISTS 'U16MB'`)

  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'RHC'`)
  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'U12A'`)
  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'U12B'`)
  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'U14JA'`)
  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'U14JB'`)
  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'U16MA'`)
  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'U16MB'`)

  await db.execute(sql`ALTER TYPE "public"."enum_trainingen_reeks" ADD VALUE IF NOT EXISTS 'RHC'`)
  await db.execute(sql`ALTER TYPE "public"."enum_trainingen_reeks" ADD VALUE IF NOT EXISTS 'U12A'`)
  await db.execute(sql`ALTER TYPE "public"."enum_trainingen_reeks" ADD VALUE IF NOT EXISTS 'U12B'`)
  await db.execute(sql`ALTER TYPE "public"."enum_trainingen_reeks" ADD VALUE IF NOT EXISTS 'U14JA'`)
  await db.execute(sql`ALTER TYPE "public"."enum_trainingen_reeks" ADD VALUE IF NOT EXISTS 'U14JB'`)
  await db.execute(sql`ALTER TYPE "public"."enum_trainingen_reeks" ADD VALUE IF NOT EXISTS 'U16MA'`)
  await db.execute(sql`ALTER TYPE "public"."enum_trainingen_reeks" ADD VALUE IF NOT EXISTS 'U16MB'`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Een enum-waarde verwijderen vereist het hele type te herbouwen; we laten de waarden bewust staan.
}
