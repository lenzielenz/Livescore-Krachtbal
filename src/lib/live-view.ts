// Voorkeur "per dag" of "per weekend" bekijken op het live-bord (LiveBoard). Puur/client-veilig —
// geen next/headers hier, zodat dit ook in de 'use client' LiveBoard geïmporteerd mag worden. Het
// server-side lezen van de cookie gebeurt rechtstreeks in page.tsx/live/page.tsx (analoog aan
// SEASON_COOKIE/analyse-season.ts).

export type LiveView = 'dag' | 'weekend'

export const LIVE_VIEW_COOKIE = 'kb-live-view'
