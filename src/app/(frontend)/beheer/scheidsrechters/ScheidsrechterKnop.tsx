'use client'

import { UserPlus } from 'lucide-react'
import { useState } from 'react'

import { ScheidsrechterDialoog } from '@/components/fed-shell/SnelMenu'

/** "Scheidsrechter toevoegen" op het toewijsscherm: zelfde dialoog als in "Snel doen". */
export function ScheidsrechterKnop() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="fs-knop fs-knop-primair" onClick={() => setOpen(true)}>
        <UserPlus className="fs-icon" aria-hidden /> Scheidsrechter toevoegen
      </button>
      {open && <ScheidsrechterDialoog onClose={() => setOpen(false)} />}
    </>
  )
}
