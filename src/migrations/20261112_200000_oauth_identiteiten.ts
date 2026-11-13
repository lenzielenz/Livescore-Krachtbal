import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Inloggen met Google, Microsoft en Apple (lib/oauth.ts): welke externe accounts aan een gebruiker
// gekoppeld zijn (users.oauthIdentiteiten). Onafhankelijk van andere migraties.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_users_oauth_identiteiten_dienst" AS ENUM('google', 'microsoft', 'apple');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE TABLE IF NOT EXISTS "users_oauth_identiteiten" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sleutel" varchar NOT NULL,
  	"dienst" "enum_users_oauth_identiteiten_dienst" NOT NULL,
  	"email" varchar,
  	"gekoppeld_op" timestamp(3) with time zone
  );
  DO $$ BEGIN
    ALTER TABLE "users_oauth_identiteiten" ADD CONSTRAINT "users_oauth_identiteiten_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "users_oauth_identiteiten_order_idx" ON "users_oauth_identiteiten" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "users_oauth_identiteiten_parent_id_idx" ON "users_oauth_identiteiten" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "users_oauth_identiteiten_sleutel_idx" ON "users_oauth_identiteiten" USING btree ("sleutel");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "users_oauth_identiteiten" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_users_oauth_identiteiten_dienst";`)
}
