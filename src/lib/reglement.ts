import { readFile } from 'fs/promises'
import path from 'path'

import { Marked } from 'marked'

import { formatDateBE } from './datetime'

// Rendert het canonieke KRACHTBAL-REGLEMENT.md naar HTML + inhoudsopgave (REGLEMENT-PAGINA-SPEC).
// Eén bron van waarheid: dezelfde markdown die de regellogica voedt, wordt hier publiek getoond.

export type TocEntry = { depth: number; text: string; id: string }
export type ReglementContent = { html: string; toc: TocEntry[]; bron: string }

const REGLEMENT_FILE = 'KRACHTBAL-REGLEMENT.md'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export type Verslag = { id: number; titel: string; datum: string; artikel: string | null; html: string }
export type Regel = { id: number; naam: string; soort: string; samenvatting: string; bron: string }

/**
 * Het reglement dat nu geldt. Bron: de actieve versie die de federatie in de databank zette
 * (/federatie/reglement); zolang er geen is, het canonieke KRACHTBAL-REGLEMENT.md uit de code.
 */
export async function loadReglement(): Promise<ReglementContent | null> {
  const uitDb = await actiefUitDatabank().catch(() => null)
  if (uitDb) return renderReglement(uitDb.md, uitDb.bron)
  let md: string
  try {
    md = await readFile(path.join(process.cwd(), REGLEMENT_FILE), 'utf8')
  } catch {
    return null
  }
  return renderReglement(md, 'RCVK — KVKBF vzw, geldig vanaf 01/07/2025')
}

async function actiefUitDatabank(): Promise<{ md: string; bron: string } | null> {
  const { getPayloadClient } = await import('./payload-client')
  const payload = await getPayloadClient()
  const r = (await payload.find({ collection: 'reglementen', where: { status: { equals: 'actief' } }, sort: '-geldigVanaf', limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!r?.inhoud) return null
  const vanaf = r.geldigVanaf ? formatDateBE(String(r.geldigVanaf)) : ''
  return { md: String(r.inhoud), bron: `${String(r.titel)}${vanaf ? `, geldig vanaf ${vanaf}` : ''}` }
}

/** De verslagen die nu van toepassing zijn, en de regels (bouwstenen) die het systeem uitvoert. */
export async function loadWijzigingen(): Promise<{ verslagen: Verslag[]; regels: Regel[] }> {
  const { getPayloadClient } = await import('./payload-client')
  const { bronTekst } = await import('./competitieregels')
  const payload = await getPayloadClient()
  const [vs, rs] = await Promise.all([
    payload.find({ collection: 'reglement-verslagen', where: { status: { equals: 'actief' } }, sort: '-datum', limit: 100, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'competitieregels', where: { actief: { equals: true } }, sort: 'naam', limit: 100, depth: 1, overrideAccess: true }),
  ])
  const md = new Marked()
  const verslagen = await Promise.all(
    vs.docs.map(async (v) => ({
      id: Number(v.id),
      titel: String(v.titel),
      datum: String(v.datum),
      artikel: v.artikel ? String(v.artikel) : null,
      html: await md.parse(String(v.inhoud ?? '')),
    })),
  )
  const regels = rs.docs.map((r) => ({
    id: Number(r.id),
    naam: String(r.naam),
    soort: String(r.soort),
    samenvatting:
      r.soort === 'vastspelen'
        ? `Wie ${r.maxKeerHoger}× in een hogere ploeg van zijn club speelt, zit vast in die reeks${r.categorie && r.categorie !== 'alle' ? ` (${r.categorie})` : ''}.`
        : `${(r.bronReeksen ?? []).join(', ')}: de beste ${r.topPerReeks ?? 4} per reeks spelen een eindronde${r.heenEnTerug ? ' (heen en terug)' : ''}.`,
    bron: bronTekst(r),
  }))
  return { verslagen, regels }
}

async function renderReglement(md: string, bron: string): Promise<ReglementContent> {
  const used = new Map<string, number>()
  const uniqueSlug = (text: string) => {
    const base = slugify(text) || 'sectie'
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }

  const toc: TocEntry[] = []
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens) as string
        const raw = tokens.map((t) => ('text' in t ? (t.text as string) : '')).join('')
        const id = uniqueSlug(raw)
        if (depth <= 3) toc.push({ depth, text: raw, id })
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`
      },
    },
  })

  const html = await marked.parse(md)
  return { html, toc, bron }
}
