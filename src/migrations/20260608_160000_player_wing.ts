import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Spelerpositie: linker/rechter vleugel toevoegen aan de enum (naast achter/vleugel/barage).
// Dit voedt de slimme vanger-suggestie in de aantekenaar (de 13m-regel: korte worp → vleugel aan
// die kant; diepe worp → achterman). Bestaande 'vleugel'-waarden blijven geldig.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_players_position" ADD VALUE IF NOT EXISTS 'vleugel-links';
  ALTER TYPE "public"."enum_players_position" ADD VALUE IF NOT EXISTS 'vleugel-rechts';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Een enum-waarde verwijderen in Postgres vereist het hele type te herbouwen; we laten de extra
  // waarden bewust staan (onschadelijk) i.p.v. een riskante terugdraai.
}
