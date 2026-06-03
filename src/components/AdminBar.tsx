'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { PACKAGE_LIST, type PackageTier } from '@/lib/packages'
import { PKG_PREVIEW_COOKIE } from '@/lib/package-preview-shared'
import './admin-bar.css'

// Globale admin-balk: toont dat je als admin/federatie ingelogd bent en laat je
// een pakketniveau previewen (Starter/Team/Elite). De preview wijzigt alleen je
// eigen weergave — niet het pakket van de club. De keuze gaat via een cookie;
// router.refresh() herrendert de server-componenten met het gekozen pakket.
export function AdminBar({ role, preview }: { role: string; preview: PackageTier | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function choose(tier: PackageTier | null) {
    if (tier) {
      document.cookie = `${PKG_PREVIEW_COOKIE}=${tier}; path=/; max-age=31536000; samesite=lax`
    } else {
      document.cookie = `${PKG_PREVIEW_COOKIE}=; path=/; max-age=0; samesite=lax`
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="admin-bar" role="region" aria-label="Admin-balk">
      <span className="admin-bar-badge">🛡 {role}</span>
      <span className="admin-bar-lbl">Pakket-preview</span>
      <div className="admin-bar-pkgs">
        <button
          type="button"
          className={`admin-bar-pkg ${preview === null ? 'on' : ''}`}
          onClick={() => choose(null)}
          disabled={pending}
        >
          Standaard
        </button>
        {PACKAGE_LIST.map((p) => (
          <button
            type="button"
            key={p.tier}
            className={`admin-bar-pkg ${preview === p.tier ? 'on' : ''}`}
            onClick={() => choose(p.tier)}
            disabled={pending}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}
