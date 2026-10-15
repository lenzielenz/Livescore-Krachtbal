import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { StadionThema } from '@/lib/virtueel'
import { MUUR_H, muurLengte, tekenMuurBasis, tekenStreek, type Tag } from '@/lib/virtueel-graffiti'
import { GOUDEN_BALLEN, MAX_EENDEN, waterKleur, type Sporenstaat } from '@/lib/virtueel-sporen'
import { tekenTactiekbord, type Tactiek } from '@/lib/virtueel-tactiek'
import type { BordPlek, KelderPlekken } from './kelder'
import { canvasTex } from './stadion'

// Wat bezoekers in de kelder achterlaten, voor wie na hen komt kijken (zie lib/virtueel-sporen.ts):
//  • 🦆 eendjes die in het zwembad dobberen (en de kleur van het water, van de verf die erin ging);
//  • 🍿 de teller van de popcornmachine in de cinema, en een wolk popcorn als jij er maakt;
//  • 🏃 het bord in de fitness: hoeveel kilometer de club samen liep, met de top 5;
//  • 💺 de naam van wie het laatst op elke cinemazetel zat;
//  • 🎮 de highscores van Doelworp in de gameroom, en 🟡 de kampioenen van de goudjacht;
//  • 🎨 de graffitimuur en 📋 het tactiekbord in de speelhal.
// Alles staat in de groep van de kelder, en wordt dus enkel getekend als je beneden bent.

const PPM = 80

export type KelderActie =
  | { soort: 'bad' }
  | { soort: 'popcorn' }
  | { soort: 'loopband' }
  | { soort: 'zetel'; nr: number }
  | { soort: 'arcade' }
  | { soort: 'kmuur' }
  | { soort: 'kbord' }

export type Kelderspel = {
  zetStaat: (s: Sporenstaat) => void
  zetTags: (tags: Tag[], lengte: number) => void
  zetTactiek: (t: Tactiek) => void
  /** Een eendje vliegt van waar je staat naar zijn plek in het bad. */
  werpEend: (u: number, v: number, kleur: string, van: { x: number; z: number }) => void
  /** Een wolk popcorn boven de machine. */
  popcorn: () => void
  /** Wat kan je hier doen? */
  nabij: (x: number, z: number) => KelderActie | null
  /** Waar je zit op een zetel (en waar je naar kijkt). */
  zetel: (nr: number) => { x: number; z: number } | null
  /** Waar in het bad (u, v) een eendje landt als je vanaf hier werpt. */
  mikpunt: (x: number, z: number) => { u: number; v: number }
  update: (seconden: number, dt: number) => void
}

export function bouwKelderspel(groep: THREE.Group, opt: { thema: StadionThema; plekken: KelderPlekken; zetWaterKleur: (hex: string) => void; licht: boolean }): Kelderspel {
  const { thema, plekken: P } = opt
  const Y = P.bad.y + 0.15

  // ---------- borden aan de muur (canvas) ----------
  const maakBord = (plek: BordPlek, pxB: number) => {
    const c = document.createElement('canvas')
    c.width = pxB
    c.height = Math.round((pxB * plek.h) / plek.b)
    const tex = canvasTex(c)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(plek.b, plek.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    m.position.set(plek.x, plek.y, plek.z)
    m.rotation.y = plek.ry
    // Een fractie van de muur af, zodat het niet flikkert.
    m.position.x += Math.sin(plek.ry) * 0.02
    m.position.z += Math.cos(plek.ry) * 0.02
    groep.add(m)
    return {
      teken(f: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
        f(c.getContext('2d')!, c.width, c.height)
        tex.needsUpdate = true
      },
    }
  }
  const kader = (g: CanvasRenderingContext2D, w: number, h: number, kleur: string, titel: string) => {
    const gr = g.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#0f172a')
    gr.addColorStop(1, '#020617')
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
    g.strokeStyle = kleur
    g.lineWidth = Math.max(6, w * 0.012)
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth)
    g.fillStyle = kleur
    g.font = `900 ${Math.round(h * 0.13)}px Inter, system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = kleur
    g.shadowBlur = 18
    g.fillText(titel, w / 2, h * 0.13, w * 0.92)
    g.shadowBlur = 0
  }
  const lijst = (g: CanvasRenderingContext2D, w: number, h: number, rijen: [string, string][], van: number, leeg: string) => {
    const n = Math.max(rijen.length, 1)
    const rh = Math.min(h * 0.15, (h * (0.95 - van)) / n)
    g.font = `800 ${Math.round(rh * 0.74)}px Inter, system-ui, sans-serif`
    g.textBaseline = 'middle'
    if (!rijen.length) {
      g.fillStyle = '#94a3b8'
      g.textAlign = 'center'
      g.fillText(leeg, w / 2, h * (van + 0.15), w * 0.9)
      return
    }
    rijen.forEach(([l, r], i) => {
      const y = h * van + rh * (i + 0.5)
      g.fillStyle = i === 0 ? '#fde047' : '#e2e8f0'
      g.textAlign = 'left'
      g.fillText(l, w * 0.07, y, w * 0.6)
      g.textAlign = 'right'
      g.fillText(r, w * 0.93, y, w * 0.3)
    })
  }
  const getal = (n: number) => n.toLocaleString('nl-BE')

  const popcornBord = maakBord(P.popcornBord, 768)
  const loopbandBord = maakBord(P.loopbandBord, 768)
  const scoreBord = maakBord(P.scoreBord, 768)
  const kampioenBord = maakBord(P.kampioenBord, 768)

  // ---------- eendjes in het bad ----------
  const eendGeo = mergeGeometries([
    new THREE.SphereGeometry(0.16, 12, 8).scale(1.25, 0.8, 1).translate(0, 0.06, 0),
    new THREE.SphereGeometry(0.09, 10, 8).translate(0.13, 0.2, 0),
    new THREE.ConeGeometry(0.04, 0.09, 8).rotateZ(-Math.PI / 2).translate(0.25, 0.19, 0),
  ])!
  const eendMat = new THREE.MeshLambertMaterial({ emissive: '#2a2010', emissiveIntensity: 0.6 })
  const MAX = MAX_EENDEN + 20
  const eenden = new THREE.InstancedMesh(eendGeo, eendMat, MAX)
  eenden.count = 0
  eenden.frustumCulled = false
  groep.add(eenden)
  type Eend = { x: number; z: number; f: number; hoek: number; kleur: THREE.Color }
  let eendLijst: Eend[] = []
  const bw = P.bad.x1 - P.bad.x0
  const bd = P.bad.z1 - P.bad.z0
  const eendOp = (u: number, v: number, kleur: string, i: number): Eend => ({
    x: P.bad.x0 + 0.4 + u * (bw - 0.8),
    z: P.bad.z0 + 0.4 + v * (bd - 0.8),
    f: i * 1.37,
    hoek: (i * 2.39) % (Math.PI * 2),
    kleur: new THREE.Color(kleur),
  })
  const vlucht: { m: THREE.Mesh; van: THREE.Vector3; naar: Eend; t: number }[] = []

  // ---------- popcorn ----------
  const N_POP = 90
  const popPos = new Float32Array(N_POP * 3)
  const popV = new Float32Array(N_POP * 3)
  const popGeo = new THREE.BufferGeometry()
  popGeo.setAttribute('position', new THREE.BufferAttribute(popPos, 3))
  // Een popcornkorrel: een bolletje met een gele schijn.
  const korrel = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(13, 13, 2, 16, 16, 15)
    gr.addColorStop(0, '#ffffff')
    gr.addColorStop(0.6, '#fff1c2')
    gr.addColorStop(0.85, '#f5d78a')
    gr.addColorStop(1, 'rgba(245,215,138,0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(16, 16, 15, 0, Math.PI * 2)
    g.fill()
    return canvasTex(c)
  })()
  const pop = new THREE.Points(popGeo, new THREE.PointsMaterial({ map: korrel, size: 0.06, transparent: true, opacity: 1, depthWrite: false, alphaTest: 0.05 }))
  pop.visible = false
  pop.frustumCulled = false
  groep.add(pop)
  let popTijd = -1

  // ---------- namen op de zetels ----------
  const zetelGroep = new THREE.Group()
  groep.add(zetelGroep)
  const naamSprite = (tekst: string) => {
    const c = document.createElement('canvas')
    const m = c.getContext('2d')!
    m.font = '800 28px Inter, system-ui, sans-serif'
    const w = Math.ceil(Math.min(220, m.measureText(tekst).width) + 24)
    c.width = w
    c.height = 40
    const g = c.getContext('2d')!
    g.fillStyle = 'rgba(69,10,10,.85)'
    g.beginPath()
    g.roundRect(1, 2, w - 2, 36, 12)
    g.fill()
    g.font = '800 28px Inter, system-ui, sans-serif'
    g.fillStyle = '#fde68a'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(tekst, w / 2, 21, 220)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false }))
    s.scale.set((0.2 * w) / 40, 0.2, 1)
    return s
  }

  // ---------- graffitimuur in de speelhal ----------
  const G = P.graffiti
  let lengte = muurLengte(0)
  let tags: Tag[] = []
  const muurC = document.createElement('canvas')
  const muurTex = canvasTex(muurC)
  const muurMat = new THREE.MeshBasicMaterial({ map: muurTex })
  let muurVlak: THREE.Mesh | null = null
  const club = { naam: thema.naam, primair: thema.primair, secundair: thema.secundair }
  const bouwMuur = () => {
    muurC.width = Math.round(lengte * PPM)
    muurC.height = Math.round(MUUR_H * PPM)
    tekenMuurBasis(muurC.getContext('2d')!, lengte, PPM, club)
    muurTex.needsUpdate = true
    if (muurVlak) {
      groep.remove(muurVlak)
      muurVlak.geometry.dispose()
    }
    muurVlak = new THREE.Mesh(new THREE.PlaneGeometry(lengte, MUUR_H), muurMat)
    muurVlak.position.set(G.x + G.dx * (lengte / 2), Y + MUUR_H / 2, G.z + G.dz * (lengte / 2))
    muurVlak.rotation.y = G.ry
    groep.add(muurVlak)
  }
  bouwMuur()
  let tekenTaak = 0
  const tekenTags = (vanaf: number) => {
    const taak = ++tekenTaak
    const g = muurC.getContext('2d')!
    let i = vanaf
    const stap = () => {
      if (taak !== tekenTaak) return
      const einde = Math.min(tags.length, i + 25)
      for (; i < einde; i++) for (const s of tags[i].streken) tekenStreek(g, s, PPM)
      muurTex.needsUpdate = true
      if (i < tags.length) setTimeout(stap, 16)
    }
    stap()
  }

  // ---------- tactiekbord in de speelhal ----------
  const T = P.tactiek
  const tacC = document.createElement('canvas')
  tacC.width = 1024
  tacC.height = 640
  const tacTex = canvasTex(tacC)
  const tekenTactiek = (t: Tactiek) => {
    tekenTactiekbord(tacC.getContext('2d')!, 1024, 640, t, { wij: thema.primair, tekstWij: thema.tekstOpPrimair })
    tacTex.needsUpdate = true
  }
  tekenTactiek({ magneten: [], lijnen: [] })
  const whiteboard = new THREE.Mesh(new THREE.PlaneGeometry(T.b, T.h), new THREE.MeshBasicMaterial({ map: tacTex, toneMapped: false }))
  whiteboard.position.set(T.x + Math.sin(T.ry) * 0.03, T.y, T.z + Math.cos(T.ry) * 0.03)
  whiteboard.rotation.y = T.ry
  const lijst_ = new THREE.Mesh(new THREE.BoxGeometry(T.b + 0.14, T.h + 0.14, 0.04), new THREE.MeshLambertMaterial({ color: '#9ca3af' }))
  lijst_.position.set(T.x + Math.sin(T.ry) * 0.01, T.y, T.z + Math.cos(T.ry) * 0.01)
  lijst_.rotation.y = T.ry
  groep.add(lijst_, whiteboard)

  // ---------- borden vullen ----------
  const zetStaat = (s: Sporenstaat) => {
    popcornBord.teken((g, w, h) => {
      kader(g, w, h, '#facc15', '🍿 POPCORN-TELLER')
      g.fillStyle = '#ffffff'
      g.font = `900 ${Math.round(h * 0.34)}px Inter, system-ui, sans-serif`
      g.fillText(getal(s.popcorn.totaal), w / 2, h * 0.52, w * 0.9)
      g.fillStyle = '#fde68a'
      g.font = `700 ${Math.round(h * 0.12)}px Inter, system-ui, sans-serif`
      g.fillText(s.popcorn.laatste ? `bakjes gepoft · laatst door ${s.popcorn.laatste}` : 'bakjes gepoft · maak jij het eerste?', w / 2, h * 0.84, w * 0.9)
    })
    loopbandBord.teken((g, w, h) => {
      kader(g, w, h, '#38bdf8', '🏃 SAMEN GELOPEN')
      g.fillStyle = '#ffffff'
      g.font = `900 ${Math.round(h * 0.17)}px Inter, system-ui, sans-serif`
      g.fillText(`${(s.loopband.meter / 1000).toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`, w / 2, h * 0.33, w * 0.9)
      lijst(g, w, h, s.loopband.top.map((t, i) => [`${i + 1}. ${t.naam}`, `${getal(t.meter)} m`]), 0.46, 'Spring op een loopband!')
    })
    scoreBord.teken((g, w, h) => {
      kader(g, w, h, '#f472b6', '🎮 DOELWORP · TOP 10')
      lijst(g, w, h, s.doelworp.map((t, i) => [`${i + 1}. ${t.naam}`, `${t.score}`]), 0.25, 'Nog geen scores — speel jij?')
    })
    kampioenBord.teken((g, w, h) => {
      kader(g, w, h, '#fbbf24', '🟡 GOUDZOEKERS')
      g.fillStyle = '#fde68a'
      g.font = `600 ${Math.round(h * 0.06)}px Inter, system-ui, sans-serif`
      g.fillText(`Vonden alle ${GOUDEN_BALLEN} gouden krachtballen in het stadion`, w / 2, h * 0.25, w * 0.9)
      lijst(g, w, h, s.vondsten.kampioenen.slice(0, 7).map((n, i) => [`${i + 1}. ${n}`, '🏆']), 0.32, 'Nog niemand — zoek ze allemaal!')
    })
    // Eendjes: wie al dobbert, blijft op zijn plek (enkel nieuwe erbij).
    eendLijst = s.eenden.map((e, i) => eendOp(e.u, e.v, e.kleur, i))
    opt.zetWaterKleur(waterKleur(s.verf))
    // Namen op de zetels.
    for (const c of [...zetelGroep.children]) {
      zetelGroep.remove(c)
      const sp = c as THREE.Sprite
      sp.material.map?.dispose()
      sp.material.dispose()
    }
    for (const [nr, naam] of Object.entries(s.zetels)) {
      const p = P.zetels[Number(nr)]
      if (!p) continue
      const sp = naamSprite(naam)
      sp.position.set(p.x, Y + 1.25, p.z + 0.38)
      zetelGroep.add(sp)
    }
    if (s.borden.kelder) tekenTactiek(s.borden.kelder)
  }

  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const as = new THREE.Vector3(0, 1, 0)
  const een = new THREE.Vector3(1, 1, 1)
  const pos = new THREE.Vector3()

  return {
    zetStaat,
    zetTags(nieuw, nieuweLengte) {
      const groei = nieuweLengte !== lengte
      const alleenErbij = !groei && nieuw.length >= tags.length && nieuw.slice(0, tags.length).every((x, i) => x.id === tags[i].id)
      const vanaf = alleenErbij ? tags.length : 0
      tags = nieuw
      if (groei) {
        lengte = Math.min(nieuweLengte, G.max)
        bouwMuur()
      } else if (!alleenErbij) tekenMuurBasis(muurC.getContext('2d')!, lengte, PPM, club)
      tekenTags(groei ? 0 : vanaf)
    },
    zetTactiek: tekenTactiek,
    werpEend(u, v, kleur, van) {
      const doel = eendOp(u, v, kleur, eendLijst.length + vlucht.length)
      const m = new THREE.Mesh(eendGeo, new THREE.MeshLambertMaterial({ color: kleur, emissive: '#2a2010', emissiveIntensity: 0.6 }))
      m.scale.setScalar(1.3)
      groep.add(m)
      vlucht.push({ m, van: new THREE.Vector3(van.x, Y + 1.3, van.z), naar: doel, t: 0 })
    },
    popcorn() {
      popTijd = 0
      pop.visible = true
      for (let i = 0; i < N_POP; i++) {
        popPos.set([P.popcorn.x + (Math.random() - 0.5) * 0.6, P.popcorn.y + 0.2, P.popcorn.z + (Math.random() - 0.5) * 0.3], i * 3)
        const a = Math.random() * Math.PI * 2
        const r = 0.6 + Math.random() * 1.4
        popV.set([Math.cos(a) * r, 2.5 + Math.random() * 2.5, Math.sin(a) * r], i * 3)
      }
    },
    nabij(x, z) {
      // Aan de rand van het bad.
      const b = P.bad
      const dx = Math.max(b.x0 - x, 0, x - b.x1)
      const dz = Math.max(b.z0 - z, 0, z - b.z1)
      if (Math.hypot(dx, dz) < 3) return { soort: 'bad' }
      if (Math.hypot(x - P.popcorn.x, z - P.popcorn.z) < 2.4) return { soort: 'popcorn' }
      if (P.loopbanden.some((l) => Math.hypot(x - l.x, z - l.z) < 1.3)) return { soort: 'loopband' }
      // De arcadekasten staan op een rij tegen de wand.
      if (Math.abs(x - P.arcade.x) < 2.6 && Math.abs(z - P.arcade.z) < 4.6) return { soort: 'arcade' }
      // De zetels: je staat in de rij erachter (de rijen zijn obstakels), dus kijk naar de dichtste.
      let beste = -1
      let d = 1.1
      P.zetels.forEach((p, i) => {
        const dd = Math.hypot(x - p.x, z - (p.z + 0.9))
        if (dd < d) {
          d = dd
          beste = i
        }
      })
      if (beste >= 0) return { soort: 'zetel', nr: beste }
      // De graffitimuur (oostwand van de speelhal) en het tactiekbord (westwand).
      const langs = (x - G.x) * G.dx + (z - G.z) * G.dz
      const voor = Math.abs((x - G.x) * G.dz - (z - G.z) * G.dx)
      if (langs > -0.5 && langs < lengte + 0.5 && voor < 4.5) return { soort: 'kmuur' }
      if (Math.abs(x - T.x) < 3 && Math.abs(z - T.z) < 2.4) return { soort: 'kbord' }
      return null
    },
    zetel: (nr) => P.zetels[nr] ?? null,
    mikpunt(x, z) {
      // Van waar je staat, een paar meter het bad in (met een beetje toeval).
      const cx = Math.min(P.bad.x1 - 0.6, Math.max(P.bad.x0 + 0.6, x))
      const cz = Math.min(P.bad.z1 - 0.6, Math.max(P.bad.z0 + 0.6, z))
      const nx = cx + (cx === x ? 0 : Math.sign(cx - x) * (1.5 + Math.random() * 3)) + (Math.random() - 0.5) * 2
      const nz = cz + (cz === z ? 0 : Math.sign(cz - z) * (1.5 + Math.random() * 3)) + (Math.random() - 0.5) * 2
      const u = Math.min(1, Math.max(0, (nx - P.bad.x0 - 0.4) / (bw - 0.8)))
      const v = Math.min(1, Math.max(0, (nz - P.bad.z0 - 0.4) / (bd - 0.8)))
      return { u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000 }
    },
    update(seconden, dt) {
      if (!groep.visible) return
      // Dobberende eendjes, die traag rondjes draaien.
      const n = Math.min(MAX, eendLijst.length)
      for (let i = 0; i < n; i++) {
        const e = eendLijst[i]
        q.setFromAxisAngle(as, e.hoek + seconden * 0.15 * (i % 2 ? 1 : -1))
        pos.set(e.x + Math.sin(seconden * 0.3 + e.f) * 0.15, P.bad.y + Math.sin(seconden * 2 + e.f) * 0.025, e.z + Math.cos(seconden * 0.27 + e.f) * 0.15)
        m4.compose(pos, q, een)
        eenden.setMatrixAt(i, m4)
        eenden.setColorAt(i, e.kleur)
      }
      eenden.count = n
      eenden.instanceMatrix.needsUpdate = true
      if (eenden.instanceColor) eenden.instanceColor.needsUpdate = true
      // Een eendje in de lucht: een boog, en dan een plons.
      for (let i = vlucht.length - 1; i >= 0; i--) {
        const v = vlucht[i]
        v.t += dt / 0.9
        const t = Math.min(1, v.t)
        v.m.position.set(v.van.x + (v.naar.x - v.van.x) * t, v.van.y + (P.bad.y - v.van.y) * t + Math.sin(t * Math.PI) * 2.2, v.van.z + (v.naar.z - v.van.z) * t)
        v.m.rotation.z = t * Math.PI * 4
        if (t >= 1) {
          groep.remove(v.m)
          ;(v.m.material as THREE.Material).dispose()
          vlucht.splice(i, 1)
          eendLijst.push(v.naar)
          if (eendLijst.length > MAX) eendLijst.shift()
        }
      }
      // Popcorn: omhoog, en terug naar beneden.
      if (popTijd >= 0) {
        popTijd += dt
        for (let i = 0; i < N_POP; i++) {
          popV[i * 3 + 1] -= 9.8 * dt
          popPos[i * 3] += popV[i * 3] * dt
          popPos[i * 3 + 1] = Math.max(Y + 0.03, popPos[i * 3 + 1] + popV[i * 3 + 1] * dt)
          popPos[i * 3 + 2] += popV[i * 3 + 2] * dt
        }
        popGeo.attributes.position.needsUpdate = true
        ;(pop.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - Math.max(0, popTijd - 1.6))
        if (popTijd > 2.6) {
          popTijd = -1
          pop.visible = false
        }
      }
    },
  }
}
