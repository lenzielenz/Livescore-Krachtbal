import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'
import type { Aanwezige } from '@/lib/virtueel-aanwezig'
import { bouwAvatar, type Avatar } from './avatar'

// De andere supporters van je club die nu ook in het stadion rondlopen: elk als figuur in zijn
// eigen outfit, met zijn voornaam erboven. Hun plek komt een paar keer per seconde binnen (SSE);
// hier glijden ze er vloeiend naartoe, en ze stappen echt (de benen bewegen met hun tempo).

export type Samen = {
  zet: (lijst: Aanwezige[]) => void
  /** `verdiep` = waar jij bent (enkel wie op hetzelfde verdiep is, zie je); `boven` = je zweeft. */
  update: (seconden: number, dt: number, verdiep: number, boven: boolean) => void
  aantal: () => number
  /** Een tekstballon boven het hoofd van deze supporter (een paar seconden). */
  zeg: (id: string, tekst: string) => void
  dispose: () => void
}

type Ander = { avatar: Avatar; naam: THREE.Sprite; doel: Aanwezige; x: number; y: number; z: number; yaw: number; tempo: number; outfit: string; gezien: number; ballon: { sprite: THREE.Sprite; tot: number } | null }

/** Een tekstballon: wit, afgerond, met een puntje naar beneden. */
function ballon(tekst: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const g = c.getContext('2d')!
  g.font = '700 38px Inter, system-ui, sans-serif'
  const w = Math.min(500, g.measureText(tekst).width + 48)
  g.fillStyle = 'rgba(255,255,255,.96)'
  g.beginPath()
  g.roundRect(256 - w / 2, 8, w, 100, 30)
  g.fill()
  g.beginPath()
  g.moveTo(236, 104)
  g.lineTo(256, 140)
  g.lineTo(276, 104)
  g.fill()
  g.fillStyle = '#0b1220'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(tekst, 256, 60, 470)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }))
  sp.scale.set(1.9, 0.6, 1)
  sp.renderOrder = 10
  return sp
}

function naamBordje(naam: string, kleur: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.font = '800 34px Inter, system-ui, sans-serif'
  const w = Math.min(248, g.measureText(naam).width + 34)
  g.fillStyle = 'rgba(6,10,18,.78)'
  g.beginPath()
  g.roundRect(128 - w / 2, 6, w, 50, 25)
  g.fill()
  g.fillStyle = kleur
  g.fillRect(128 - w / 2 + 14, 24, 10, 10)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(naam, 128 + 8, 32, 220)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
  s.scale.set(1.2, 0.3, 1)
  return s
}

export function bouwSamen(scene: THREE.Scene, thema: StadionThema, ikId: string | null): Samen {
  const anderen = new Map<string, Ander>()
  return {
    zet(lijst) {
      const nu = performance.now()
      for (const a of lijst) {
        if (a.id === ikId) continue
        let o = anderen.get(a.id)
        if (!o) {
          const avatar = bouwAvatar(scene, thema, { laag: 0, zwaaien: false })
          const naam = naamBordje(a.naam, thema.primair)
          scene.add(naam)
          o = { avatar, naam, doel: a, x: a.x, y: a.y, z: a.z, yaw: a.yaw, tempo: 0, outfit: '', gezien: nu, ballon: null }
          anderen.set(a.id, o)
        }
        o.doel = a
        o.gezien = nu
        const sleutel = JSON.stringify(a.outfit)
        if (sleutel !== o.outfit) {
          o.outfit = sleutel
          o.avatar.kleedAan(a.outfit)
        }
      }
      // Wie niet meer in de lijst staat, is weg.
      const ids = new Set(lijst.map((a) => a.id))
      for (const [id, o] of anderen)
        if (!ids.has(id)) {
          if (o.ballon) scene.remove(o.ballon.sprite)
          o.avatar.dispose()
          scene.remove(o.naam)
          o.naam.material.map?.dispose()
          o.naam.material.dispose()
          anderen.delete(id)
        }
    },
    update(seconden, dt, verdiep, boven) {
      for (const o of anderen.values()) {
        const d = o.doel
        // Zichtbaar als je op hetzelfde verdiep bent (of als je zweeft en zij bovengronds lopen).
        const zie = !d.vliegt && (boven ? d.verdiep >= 0 : d.verdiep === verdiep)
        o.avatar.zichtbaar(zie)
        o.naam.visible = zie
        if (o.ballon) o.ballon.sprite.visible = zie
        if (!zie) {
          o.x = d.x
          o.y = d.y
          o.z = d.z
          continue
        }
        const k = Math.min(1, dt * 6)
        const dx = (d.x - o.x) * k
        const dz = (d.z - o.z) * k
        // Te ver weg (lift, teleport): meteen erheen.
        if (Math.hypot(d.x - o.x, d.z - o.z) > 12) {
          o.x = d.x
          o.z = d.z
        } else {
          o.x += dx
          o.z += dz
        }
        o.y += (d.y - o.y) * k
        let dy = d.yaw - o.yaw
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        o.yaw += dy * k
        const tempo = dt > 0 ? Math.hypot(dx, dz) / dt : 0
        o.tempo += (tempo - o.tempo) * Math.min(1, dt * 5)
        o.avatar.update(o.x, o.y, o.z, o.yaw, 0, o.tempo, seconden)
        o.naam.position.set(o.x, o.y + 2.05, o.z)
        if (o.ballon) {
          o.ballon.sprite.position.set(o.x, o.y + 2.55, o.z)
          if (performance.now() > o.ballon.tot) {
            scene.remove(o.ballon.sprite)
            o.ballon.sprite.material.map?.dispose()
            o.ballon.sprite.material.dispose()
            o.ballon = null
          }
        }
      }
    },
    zeg(id, tekst) {
      const o = anderen.get(id)
      if (!o) return
      if (o.ballon) scene.remove(o.ballon.sprite)
      const sp = ballon(tekst)
      sp.position.set(o.x, o.y + 2.55, o.z)
      scene.add(sp)
      o.ballon = { sprite: sp, tot: performance.now() + 6000 }
    },
    aantal: () => anderen.size,
    dispose() {
      for (const o of anderen.values()) {
        o.avatar.dispose()
        scene.remove(o.naam)
      }
      anderen.clear()
    },
  }
}
