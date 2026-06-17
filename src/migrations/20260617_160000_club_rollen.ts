import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Twee nieuwe club-rollen toevoegen aan de users-rollen-enum: 'club-medewerker' (operationele
// clubhelper) en 'club-lid' (herkend lid). Elke ADD VALUE in een aparte statement en idempotent
// (IF NOT EXISTS) — zo is het een no-op als ze al bestaan. Een enum-waarde verwijderen vereist het
// hele type te herbouwen, dus de down laat ze bewust staan.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TYPE "public"."enum_users_roles" ADD VALUE IF NOT EXISTS 'club-medewerker'`)
  await db.execute(sql`ALTER TYPE "public"."enum_users_roles" ADD VALUE IF NOT EXISTS 'club-lid'`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Enum-waarden bewust laten staan (verwijderen vereist het hele type te herbouwen).
}
