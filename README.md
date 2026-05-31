# Krachtbal Live

Live-score en wedstrijdstatistiekplatform voor krachtbal. Het publiek volgt de match live; een aantekenaar voert elke worp in via een veldschema. Het systeem leidt score, regels en statistieken autonoom af uit de ruwe worp-events.

Zie [PROJECT.md](PROJECT.md) voor het volledige projectplan en de officiële regels.

## Stack

- **Next.js 16** (App Router) + **Payload CMS 3** (admin/backend)
- **Drizzle/SQLite** (Payload `@payloadcms/db-sqlite`) — op Railway via een Volume
- **SSE** voor live push naar het publiek
- **GitHub → Railway** auto-deploy (Railpack, Node 24)

## Lokaal draaien

Vereist: Node ≥ 24.14 en pnpm.

```bash
pnpm install
cp .env.example .env          # vul PAYLOAD_SECRET in
pnpm dev                      # http://localhost:3000  (admin op /admin)
```

## Commands

```bash
pnpm dev               # dev server
pnpm build             # productiebuild
pnpm start             # productie (na build)
pnpm typecheck         # tsc --noEmit
pnpm lint              # eslint
pnpm test              # unit (vitest) + e2e (playwright)
pnpm test:unit         # alleen unit
pnpm generate:types    # Payload-types regenereren
```

## Architectuur in het kort

Elke worp is een immutable record (event-sourcing). Score, balbezit, worpteller, kruisjes en statistieken worden **afgeleid** — nooit apart opgeslagen. Eén undo = laatste worp-record verwijderen, staat herberekent vanzelf.

## Deploy

Zie [docs/DEPLOY.md](docs/DEPLOY.md).
