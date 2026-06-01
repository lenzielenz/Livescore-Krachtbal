import { readFile } from 'fs/promises'
import path from 'path'

import { Marked } from 'marked'

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

export async function loadReglement(): Promise<ReglementContent | null> {
  let md: string
  try {
    md = await readFile(path.join(process.cwd(), REGLEMENT_FILE), 'utf8')
  } catch {
    return null
  }

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
  return { html, toc, bron: 'RCVK — KVKBF vzw, geldig vanaf 01/07/2025' }
}
