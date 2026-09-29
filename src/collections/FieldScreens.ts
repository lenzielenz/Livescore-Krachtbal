import type { Access, CollectionConfig } from 'payload'

import { isClubStaff, isFederationLevel, userClubId } from '../lib/access'

// Eén record per fysiek veld/scherm bij een club (bv. "Veld 1", "Veld 2"). De koppeling met een
// lopende wedstrijd gebeurt NIET hier in de admin, maar via de koppelcode op het scherm zelf: een
// aantekenaar die een wedstrijd start voert die code in op /scorekeeper, en de server koppelt
// (api/veldscherm/koppel). Bij het einde van de wedstrijd ontkoppelt Matches.ts's afterChange-hook
// automatisch en krijgt het scherm een nieuwe code — zie unpairFieldScreensForMatch.
//
// Alle échte mutaties (aantal velden instellen, koppelen, loskoppelen) lopen via eigen
// endpoints met overrideAccess: true, ná eigen club-/rolcontrole. Create/update/delete staan hier
// daarom bewust dicht — dit is enkel de grendel op de rauwe collection-/admin-API, niet de weg die
// de app zelf neemt.
const ownClubRead: Access = ({ req }) => {
  if (isFederationLevel(req.user)) return true
  if (!isClubStaff(req.user)) return false
  const clubId = userClubId(req.user)
  return clubId == null ? false : { club: { equals: clubId } }
}

export const FieldScreens: CollectionConfig = {
  slug: 'field-screens',
  labels: { singular: 'Veldscherm', plural: 'Veldschermen' },
  admin: {
    useAsTitle: 'naam',
    defaultColumns: ['naam', 'club', 'pairedMatch', 'pairingCode'],
    group: 'Beheer',
    description: 'Eén per fysiek veld/scherm bij een club. Beheer het aantal velden via "Mijn club" → Veldscherm, niet hier.',
  },
  access: {
    read: ownClubRead,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    {
      name: 'naam',
      label: 'Naam',
      type: 'text',
      required: true,
      admin: { description: 'Bv. "Veld 1" — zichtbaar op het scherm zelf en in de bediening.' },
    },
    {
      name: 'pairingCode',
      label: 'Koppelcode',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'Automatisch gezet. Verschijnt op het wachtscherm; een aantekenaar voert ze in om een wedstrijd te koppelen.',
      },
    },
    {
      name: 'pairedMatch',
      label: 'Gekoppelde wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      admin: {
        readOnly: true,
        description: 'Automatisch gezet zodra iemand de koppelcode invoert; verdwijnt weer zodra de wedstrijd afloopt.',
      },
    },
    { name: 'pairedAt', label: 'Gekoppeld sinds', type: 'date', admin: { readOnly: true } },
    {
      // Wanneer dit veld al bezet is door een lopende wedstrijd, kan de VOLGENDE wedstrijd zich
      // via diezelfde koppelcode alvast in de wachtrij zetten (zie pairOutcome in field-screens.ts).
      // Zodra de lopende wedstrijd afloopt, neemt unpairFieldScreensForMatch deze automatisch over
      // als de nieuwe pairedMatch — geen tweede keer de code hoeven intikken.
      name: 'queuedMatch',
      label: 'Wedstrijd in wachtrij',
      type: 'relationship',
      relationTo: 'matches',
      admin: {
        readOnly: true,
        description: 'Automatisch gezet via dezelfde koppelcode terwijl het veld nog bezet is — neemt over zodra de lopende wedstrijd afloopt.',
      },
    },
    { name: 'queuedAt', label: 'In wachtrij sinds', type: 'date', admin: { readOnly: true } },
    {
      // Buiten in fel zonlicht is een donker scherm nauwelijks af te lezen — een club met een
      // veld in de volle zon kiest hier de lichte variant (witte achtergrond, donkere cijfers).
      // Geldt voor het wachtscherm én het scorebord zodra er gekoppeld is (zie FieldScreen.tsx).
      name: 'theme',
      label: 'Kleurthema',
      type: 'select',
      defaultValue: 'dark',
      options: [
        { label: 'Donker (standaard) — donkere achtergrond, witte cijfers', value: 'dark' },
        { label: 'Licht — witte achtergrond, donkere cijfers (leesbaar in fel zonlicht)', value: 'light' },
      ],
      admin: { description: 'Instelbaar per veld via "Mijn club" → Veldscherm.' },
    },
    {
      // Twee vaste demo-schermen per club (wachtscherm + scorebord), automatisch aangemaakt zodra
      // iemand "Mijn club" → Veldscherm bezoekt — zie ensureClubDemoScreens in field-screens-data.ts.
      // Puur om visueel te testen/tunen; tellen bewust niet mee bij "aantal velden" (planVeldenSync
      // filtert ze eruit) en de gekoppelde demo-wedstrijd is isDemo, dus onzichtbaar op elke
      // publieke lijst/stand/recap.
      name: 'isDemo',
      label: 'Demo-scherm',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Vast demo-scherm voor visueel testen — geen echt veld, telt niet mee bij "aantal velden".',
      },
    },
  ],
}
