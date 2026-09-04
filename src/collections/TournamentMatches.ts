import type { CollectionConfig } from 'payload'

// Eén wedstrijd in een tornooischema. De stand is event-sourced: `goals[]` bevat elke gescoorde
// worp (nek = 1, rug = 2), de stand wordt afgeleid, undo = laatste goal verwijderen. `winnerTo` en
// `loserTo` (JSON-coördinaten naar een ander slot) sturen de doorschuiving aan; ze worden bij het
// aanmaken berekend door src/lib/tournament.ts.
export const TournamentMatches: CollectionConfig = {
  slug: 'tournament-matches',
  labels: { singular: 'Tornooiwedstrijd', plural: 'Tornooiwedstrijden' },
  admin: {
    useAsTitle: 'label',
    // `aantekenaars` staat erbij zodat een beheerder in de lijst meteen ziet wie welke wedstrijd
    // invulde — dat is de vraag waarmee je hier binnenkomt na een betwiste uitslag.
    defaultColumns: ['label', 'tournament', 'home', 'away', 'status', 'aantekenaars'],
    group: 'Wedstrijden',
    description:
      'Alleen inkijken. Tornooiwedstrijden worden beheerd via het /tornooi-scherm — de stand is event-sourced en met de hand aanpassen zou het schema uit balans brengen.',
  },
  access: {
    read: () => true,
    // Zichtbaar maken in de admin mag niet betekenen dat het ook bewerkbaar wordt. Zonder deze
    // regels valt Payload terug op "elke ingelogde gebruiker mag schrijven", en de admin staat voor
    // iedereen met een account open. De tornooi-engine schrijft overal met overrideAccess, dus zij
    // gaat hier gewoon langs; dit sluit enkel de handmatige weg af.
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'tournament', label: 'Tornooi', type: 'relationship', relationTo: 'tournaments', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'round', label: 'Ronde', type: 'number', required: true },
        { name: 'position', label: 'Positie', type: 'number', required: true },
        {
          name: 'bracket',
          label: 'Schema',
          type: 'select',
          options: [
            { label: 'Hoofdschema', value: 'main' },
            { label: 'Kleine finale', value: 'third' },
          ],
          defaultValue: 'main',
          required: true,
        },
        { name: 'label', label: 'Label', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'home', label: 'Thuis', type: 'text', admin: { description: 'Leeg = nog te bepalen.' } },
        { name: 'away', label: 'Uit', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Te spelen', value: 'pending' },
            { label: 'Bezig', value: 'live' },
            { label: 'Afgelopen', value: 'finished' },
          ],
          defaultValue: 'pending',
          required: true,
        },
        {
          name: 'winner',
          label: 'Winnaar',
          type: 'select',
          options: [
            { label: 'Thuis', value: 'home' },
            { label: 'Uit', value: 'away' },
          ],
        },
      ],
    },
    {
      // Gepland aanvangsuur (tornooidag-planning). Het groep-kantinescherm telt hiernaar af
      // zolang er geen wedstrijd bezig is.
      name: 'plannedAt',
      label: 'Gepland om',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } },
    },
    {
      // Op welk veld deze wedstrijd gespeeld wordt (1..aantal velden van de tornooidag).
      name: 'veld',
      label: 'Veld',
      type: 'number',
      min: 1,
      max: 12,
      admin: { description: 'Veldnummer op de tornooidag (leeg = nog niet toegewezen).' },
    },
    {
      // Pronostiek van supporters: [{ userId, name, home, away, at }] — zelfde vorm als de
      // competitie (scorePredictions op matches); gescoord met hetzelfde puntensysteem.
      name: 'scorePredictions',
      type: 'json',
      defaultValue: [],
      admin: { hidden: true },
    },
    {
      // Event-sourced score: lijst van { side, points (1/2), half, clock, ts }.
      name: 'goals',
      label: 'Doelpunten',
      type: 'json',
      defaultValue: [],
    },
    {
      // Vertrouwenslaag op supporters-scores, zelfde vorm en zelfde regels als op een gewone
      // wedstrijd (src/lib/score-trust.ts): wie deze wedstrijd meetelt, wie meetekende, en de
      // bevestigingen/betwistingen van andere kijkers. Bepaalt het 🟢/🟡-label bij de stand.
      // Automatisch beheerd door de aanteken-actie; nooit met de hand invullen.
      name: 'scoreTrust',
      label: 'Vertrouwen op de score',
      type: 'json',
      admin: { hidden: true },
    },
    {
      // Auditspoor: wie tekende deze wedstrijd aan. Lijst van
      // { id, naam, rol: 'organisatie'|'supporter', eerste, laatste, acties } — zie
      // src/lib/aantekenaars.ts. De naam is een momentopname naast de id, want `users.read` is
      // federatie-only en een publieke pagina kan de naam later niet meer ophalen.
      // Automatisch geboekt bij elke aantekenactie; nooit met de hand invullen.
      name: 'aantekenaars',
      label: 'Aangetekend door',
      type: 'json',
      defaultValue: [],
      admin: {
        readOnly: true,
        description: 'Wie deze wedstrijd aantekende — automatisch bijgehouden.',
        // Ruwe json zegt een beheerder niets; deze twee maken er een leesbare regel en een tabelletje
        // van, met dezelfde regels als de publieke vermelding op het tornooibord.
        components: {
          Cell: '/components/admin/AantekenaarInfo#AantekenaarCel',
          Field: '/components/admin/AantekenaarInfo#AantekenaarVeld',
        },
      },
    },
    {
      // Wie het eindsignaal gaf: { id, naam, op }. Apart van de lijst hierboven, want het afsluiten
      // legt de uitslag vast en schuift de winnaar door in het schema — dat is de zwaarste handeling
      // van de dag en verdient een eigen naam. Blijft een zichtbaar veld — het veld hierboven leest
      // de waarde uit dezelfde formulierstaat, en een verborgen veld is daar geen betrouwbare bron
      // voor.
      name: 'afgeslotenDoor',
      label: 'Afgesloten door',
      type: 'json',
      admin: {
        readOnly: true,
        disableListColumn: true,
        components: { Field: '/components/admin/AantekenaarInfo#AfsluiterVeld' },
      },
    },
    // Tellers per ploeg: kruisjes (rechtstreeks buiten) en aangevraagde minuten (time-outs).
    { name: 'crosses', label: 'Kruisjes', type: 'json', defaultValue: { home: 0, away: 0 } },
    { name: 'timeouts', label: 'Time-outs', type: 'json', defaultValue: { home: 0, away: 0 } },
    // Scheidsrechter-minuten (gestopte tijd) — zoals op het gewone aantekenblad.
    { name: 'refereeStops', label: 'Scheidsrechter-minuten', type: 'number', defaultValue: 0, min: 0 },
    // Doorschuif-coördinaten (berekend bij aanmaken).
    { name: 'winnerTo', type: 'json', admin: { hidden: true } },
    { name: 'loserTo', type: 'json', admin: { hidden: true } },
    {
      label: 'Klokstaat',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'currentHalf', label: 'Helft', type: 'number', defaultValue: 1, min: 1, max: 2 },
            { name: 'clockSeconds', label: 'Klok (sec)', type: 'number', defaultValue: 0, min: 0 },
            { name: 'clockRunning', label: 'Klok loopt', type: 'checkbox', defaultValue: false },
          ],
        },
        { name: 'clockUpdatedAt', label: 'Klok bijgewerkt op', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } } },
      ],
    },
  ],
}
