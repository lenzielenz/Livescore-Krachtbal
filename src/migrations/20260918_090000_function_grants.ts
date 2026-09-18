import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Nieuwe collection 'function-grants': federatie/admin kent hiermee één specifieke functie
// (veldscherm, kantinescherm, vergoedingen, ...) toe aan één specifieke gebruiker, los van diens
// rol. Zie collections/FunctionGrants.ts en lib/function-grants.ts.
//
// Backfill: club-medewerkers hadden tot nu automatisch toegang tot alle clubtools (via
// isClubStaff-controles in de app) — die controle wordt vanaf deze release vervangen door een
// expliciete toekenning per functie (club-beheerder behoudt wél de volledige, automatische
// toegang). Zonder backfill zou elke bestaande club-medewerker in productie in één klap de
// toegang tot veldscherm/kantinescherm/... verliezen; deze backfill kent hen daarom bij het
// uitrollen meteen alle zes clubtools toe voor hun eigen club, zodat niemand iets merkt — de
// federatie kan nadien per gebruiker verfijnen (intrekken of net uitbreiden) op /beheer/rechten.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_function_grants_functie" AS ENUM('club/voorspel', 'kantine', 'cast', 'club/veldscherm', 'beheer/spelers', 'beheer/training/aanwezigheid', 'beheer/leden', 'beheer/aantekenaars', 'beheer/planning', 'knipjes', 'bekerfinale');

  CREATE TABLE "function_grants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"functie" "public"."enum_function_grants_functie" NOT NULL,
  	"club_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "function_grants_id" integer;

  CREATE INDEX "function_grants_user_idx" ON "function_grants" USING btree ("user_id");
  CREATE INDEX "function_grants_functie_idx" ON "function_grants" USING btree ("functie");
  CREATE INDEX "function_grants_club_idx" ON "function_grants" USING btree ("club_id");
  CREATE INDEX "function_grants_updated_at_idx" ON "function_grants" USING btree ("updated_at");
  CREATE INDEX "function_grants_created_at_idx" ON "function_grants" USING btree ("created_at");

  ALTER TABLE "function_grants" ADD CONSTRAINT "function_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "function_grants" ADD CONSTRAINT "function_grants_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_function_grants_fk" FOREIGN KEY ("function_grants_id") REFERENCES "public"."function_grants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_function_grants_id_idx" ON "payload_locked_documents_rels" USING btree ("function_grants_id");

  INSERT INTO "function_grants" ("user_id", "functie", "club_id")
  SELECT u."id", f."functie", u."club_id"
  FROM "users" u
  CROSS JOIN (VALUES ('club/voorspel'), ('kantine'), ('cast'), ('club/veldscherm'), ('beheer/spelers'), ('beheer/training/aanwezigheid')) AS f("functie")
  WHERE u."club_id" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "users_roles" ur WHERE ur."parent_id" = u."id" AND ur."value" = 'club-medewerker');`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_function_grants_fk";
  DROP INDEX "payload_locked_documents_rels_function_grants_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "function_grants_id";

  DROP TABLE "function_grants" CASCADE;
  DROP TYPE "public"."enum_function_grants_functie";`)
}
