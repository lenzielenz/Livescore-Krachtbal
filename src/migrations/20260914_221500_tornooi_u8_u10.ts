import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// U8 en U10 bestaan enkel als tornooicategorie. De gewone competitie-enums blijven bewust
// ongewijzigd; U12 bestond al en blijft beschikbaar.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // PostgreSQL vereist elke enum-uitbreiding als eigen statement. IF NOT EXISTS houdt de
  // migratie veilig bij een herstart van de deployment.
  await db.execute(sql`ALTER TYPE "public"."enum_tournaments_category" ADD VALUE IF NOT EXISTS 'U8' BEFORE 'U12'`)
  await db.execute(sql`ALTER TYPE "public"."enum_tournaments_category" ADD VALUE IF NOT EXISTS 'U10' BEFORE 'U12'`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // PostgreSQL kan enum-waarden niet veilig afzonderlijk verwijderen zonder het type en alle
  // afhankelijke kolommen opnieuw op te bouwen. Daarom blijven ze bij een rollback bestaan.
}
