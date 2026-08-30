import type { CollectionConfig } from 'payload'

import { isFederation } from '../lib/access'
import { THROW_TYPE_OPTIONS } from './Throws'

export const CV_EVENT_TYPE_OPTIONS = [
  { label: 'Worp', value: 'worp' },
  { label: 'Vangst', value: 'vangst' },
  { label: 'Doelpunt', value: 'doelpunt' },
  { label: 'Buitenspel', value: 'buitenspel' },
] as const

// DECISION: CV-voorstellen zijn VOORSTELLEN, geen waarheid. De computer-vision-pipeline schrijft
// hier ruwe event-suggesties uit video (reviewed=false, met confidence en provenance). Het
// immutable worp-event-model (throws) blijft de enige bron van waarheid voor score, balbezit en
// statistiek — een voorstel telt nergens in mee tot iemand het reviewt en manueel overneemt.
// Schrijven gebeurt uitsluitend via POST /api/cv/events (overrideAccess), nooit rechtstreeks.
export const CvEvents: CollectionConfig = {
  slug: 'cv-events',
  labels: {
    singular: 'CV-voorstel',
    plural: 'CV-voorstellen',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['match', 'eventType', 'videoTimeS', 'confidence', 'reviewed'],
    group: 'Wedstrijden',
    description:
      'Voorstellen uit de computer-vision-pipeline (video-analyse). Dit is géén waarheid: het worp-event-model blijft de bron van score en statistiek. Een voorstel wacht op menselijke review.',
  },
  access: {
    read: isFederation,
    // Schrijven kan uitsluitend via het brug-endpoint POST /api/cv/events (overrideAccess).
    create: () => false,
    update: isFederation,
    delete: isFederation,
  },
  fields: [
    {
      name: 'match',
      label: 'Wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      required: true,
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'videoTimeS',
          label: 'Videotijd (sec)',
          type: 'number',
          required: true,
          min: 0,
        },
        {
          name: 'frame',
          label: 'Frame',
          type: 'number',
          min: 0,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'eventType',
          label: 'Eventtype',
          type: 'select',
          options: [...CV_EVENT_TYPE_OPTIONS],
          required: true,
        },
        {
          name: 'worpType',
          label: 'Type worp',
          type: 'select',
          options: [...THROW_TYPE_OPTIONS],
        },
      ],
    },
    {
      // Waargenomen landings-/eventpositie in veldmeters (x over de breedte, y over de lengte).
      type: 'row',
      fields: [
        {
          name: 'inDoelgebied',
          label: 'In doelgebied',
          type: 'checkbox',
        },
        {
          name: 'xM',
          label: 'X (m)',
          type: 'number',
        },
        {
          name: 'yM',
          label: 'Y (m)',
          type: 'number',
        },
        {
          name: 'afstandM',
          label: 'Afstand (m)',
          type: 'number',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'side',
          label: 'Ploeg',
          type: 'select',
          options: [
            { label: 'Thuis', value: 'home' },
            { label: 'Uit', value: 'away' },
          ],
        },
        {
          name: 'rugnummer',
          label: 'Rugnummer',
          type: 'number',
        },
        {
          name: 'scoreDelta',
          label: 'Score-delta',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'confidence',
      label: 'Zekerheid (0..1)',
      type: 'number',
      required: true,
      min: 0,
      max: 1,
    },
    {
      name: 'reviewed',
      label: 'Gereviewd',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description:
          'Pas na menselijke review mag een voorstel iets betekenen — het schrijft nooit zelf naar throws.',
      },
    },
    {
      // Het menselijke oordeel over dit voorstel; gezet via PATCH /api/cv/events/[id].
      name: 'verdict',
      label: 'Oordeel',
      type: 'select',
      options: [
        { label: 'Bevestigd', value: 'bevestigd' },
        { label: 'Afgewezen', value: 'afgewezen' },
      ],
      index: true,
      admin: {
        description: 'Leeg = nog te reviewen.',
      },
    },
    {
      // Bevroren bij aanmaak: corrigeert de reviewer worpType, dan blijft dit veld staan —
      // retraining wil "model zei X, mens zei Y".
      name: 'worpTypeOrigineel',
      label: 'Type worp (origineel)',
      type: 'select',
      options: [...THROW_TYPE_OPTIONS],
      // Code-enforced bevroren (niet enkel admin-cosmetica): ook via Payloads eigen REST kan dit
      // veld niet meer wijzigen. De POST-route schrijft het één keer met overrideAccess.
      access: {
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'De oorspronkelijke claim van het model, ongewijzigd door review.',
      },
    },
    {
      // Herkomst van het voorstel: welk model (en welke versie) dit event voorstelde.
      name: 'provenance',
      label: 'Herkomst',
      type: 'group',
      fields: [
        {
          name: 'model',
          label: 'Model',
          type: 'text',
          required: true,
        },
        {
          name: 'modelVersion',
          label: 'Modelversie',
          type: 'text',
        },
      ],
    },
  ],
}
