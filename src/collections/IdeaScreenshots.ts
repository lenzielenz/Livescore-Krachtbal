import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'
import { uploadDirFor } from './Media'

// Screenshot bij een ideeënbus-inzending (vooral handig bij "probleem melden"). Losse collectie
// i.p.v. een uploadveld rechtstreeks op Ideas: een upload-relatie is de standaard-Payload-manier
// om een optionele bijlage aan een gewone collectie te hangen (zelfde reden als MatchInstants/
// TornooiFotos hun eigen collectie hebben). Aanmaken gebeurt uitsluitend server-side, vanuit de
// ideeënbus-route — nooit rechtstreeks door een bezoeker.
export const IdeaScreenshots: CollectionConfig = {
  slug: 'idea-screenshots',
  labels: { singular: 'Ideeënbus-screenshot', plural: 'Ideeënbus-screenshots' },
  admin: {
    group: 'Beheer',
    description: 'Bijlages bij ideeënbus-inzendingen — zichtbaar via het screenshot-veld op het idee zelf.',
  },
  access: {
    read: ({ req }) => isFederationLevel(req.user),
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [],
  upload: {
    staticDir: uploadDirFor('idea-screenshots'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
}
