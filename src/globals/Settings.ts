import type { GlobalConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Federatie-instellingen voor de wedstrijdblad-laag. Configureerbaar door federatie/admin.
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Federatie-instellingen',
  admin: { group: 'Federatie' },
  access: {
    read: () => true,
    update: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      // Eén knop voor ALLE wedstrijden: wie tekent aan?
      //  - 'federatie' (standaard): volledige flow (opstelling, scheidsrechtersakkoord, aftekenen).
      //  - 'supporters': vrije livescore — de scheidsrechter-/aftekenflow valt weg en iedereen kan
      //    elke wedstrijd openen en gewoon de score doorgeven (ook zonder login).
      name: 'scoreMode',
      label: 'Wie tekent aan? (alle wedstrijden)',
      type: 'select',
      options: [
        { label: 'Federatie — met scheidsrechter & aftekenen', value: 'federatie' },
        { label: 'Supporters — vrije livescore (geen scheidsrechter)', value: 'supporters' },
      ],
      defaultValue: 'federatie',
      required: true,
      admin: {
        description:
          'Geldt voor álle wedstrijden. Federatie = volledige flow (opstelling, scheidsrechtersakkoord, aftekenen). Supporters = vrije livescore: de scheidsrechterflow valt weg en iedereen kan elke wedstrijd openen en de score doorgeven. In de federatie-testomgeving staat dit altijd op Federatie, wat je hier ook kiest.',
      },
    },
    {
      name: 'releaseMinutesBefore',
      label: 'Vrijgave (minuten vóór aanvang)',
      type: 'number',
      defaultValue: 60,
      min: 0,
      max: 1440,
      required: true,
      admin: {
        description:
          'Vanaf hoeveel minuten vóór het aanvangsuur mag de scheidsrechter beide opstellingen zien.',
      },
    },
    {
      // Centrale selectie voor het kantinescherm (komma-gescheiden match-ids). Beheerd via
      // /kantine zodat je op één toestel kiest en het op de kantine-tv verschijnt (cross-device).
      name: 'kantineMatchIds',
      label: 'Kantinescherm-selectie',
      type: 'text',
      admin: { hidden: true, description: 'Beheerd via de kantine-pagina (/kantine).' },
    },
    {
      // Centrale selectie voor het veldscherm (één match-id). Beheerd via /cast, zodat je
      // de wedstrijd op de veld-tv vanaf je gsm wisselt zonder de tv aan te raken.
      name: 'veldMatchId',
      label: 'Veldscherm-selectie',
      type: 'text',
      admin: { hidden: true, description: 'Beheerd via de cast-pagina (/cast).' },
    },
    {
      // Spelersregistratie (lib/registratie.ts): vanaf deze leeftijd is een e-mailadres verplicht —
      // daarmee krijgt het lid een eigen login. Jonger mag (het adres van een ouder), hoeft niet:
      // in België geeft een kind pas vanaf 13 zelf toestemming voor online diensten (GDPR).
      name: 'emailVerplichtVanaf',
      label: 'E-mailadres verplicht vanaf (leeftijd)',
      type: 'number',
      defaultValue: 13,
      min: 0,
      max: 99,
      admin: { description: 'Jonger dan deze leeftijd mag een lid zonder e-mailadres geregistreerd worden.' },
    },
    {
      // Drempel waarboven een speler door administratieve knipjes geblokkeerd wordt (fase 8).
      // Defaults; echte waarde komt van de federatie-boetelijst.
      name: 'knipjesDrempel',
      label: 'Knipjes-drempel (selectieblokkade)',
      type: 'number',
      defaultValue: 3,
      min: 1,
      max: 50,
      required: true,
      admin: {
        description: 'Bij dit aantal of meer openstaande knipjes kan een speler niet geselecteerd worden.',
      },
    },
    {
      // Wie draagt de scheidsrechterskosten (kwitantie: €13 + km-vergoeding, lib/vergoeding.ts)? Dat
      // staat niet in het reglement van dit project; de federatie kiest. Leeg = nog niet ingesteld,
      // dan tonen de clubs hun kosten niet als "te betalen".
      name: 'scheidsrechterKostenBetaler',
      label: 'Scheidsrechterskosten betaald door',
      type: 'select',
      options: [
        { label: 'De federatie', value: 'federatie' },
        { label: 'De thuisclub', value: 'thuisclub' },
        { label: 'Beide clubs, elk de helft', value: 'gedeeld' },
      ],
      admin: { description: 'Bepaalt wat elke club ziet onder "Scheidsrechterskosten" op haar boete-overzicht.' },
    },
    {
      name: 'forfaitKostenBetaler',
      label: 'Kosten bij forfait betaald door',
      type: 'select',
      options: [
        { label: 'De federatie', value: 'federatie' },
        { label: 'De ploeg die forfait gaf', value: 'forfaitploeg' },
      ],
      admin: { description: 'Het forfait-onkostenblad van de scheidsrechter (€13 + km).' },
    },
  ],
}
