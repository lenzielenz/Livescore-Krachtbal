# Deploy — Railway

GitHub → Railway auto-deploy via **Railpack** (geen Dockerfile). Elke push naar `main` triggert een nieuwe build.

## Eenmalige setup

1. **Service** maken in Railway, gekoppeld aan de GitHub-repo `lenzielenz/Livescore-Krachtbal`.
2. **Volume** koppelen (persistente SQLite-opslag), mount path: `/data`.
   - Zonder Volume gaat de database verloren bij elke redeploy.
3. **Environment variables** zetten:
   - `DATABASE_URL=file:/data/krachtbal.db` — verwijst naar het Volume.
   - `PAYLOAD_SECRET=<32-byte hex>` — genereer met
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `NODE_ENV=production` (zet Railway meestal zelf).
   - `PORT` wordt door Railway geïnjecteerd; `next start` pikt die automatisch op.

## Build & start (door Railpack afgeleid)

- Node-versie: vastgelegd in `.node-version` (24 — vereist door Next 16 / Payload 3.85).
- Install: `pnpm install`
- Build: `pnpm build` (`next build`)
- Start: `pnpm start` (`next start`) — zie `railway.json`.

## Let op

- **Node 22 → 24**: PROJECT.md noemde Node 22, maar Next 16 + Payload 3.85 vereisen Node ≥ 24.14. Daarom Node 24.
- SQLite + Volume betekent **één** service-instance (geen horizontale schaling); voor dit live-score-gebruik ruim voldoende.
- DB-migraties: Payload draait in dev met `push`-modus (auto-schema). Voor productie later `payload migrate` toevoegen aan een release-stap.
