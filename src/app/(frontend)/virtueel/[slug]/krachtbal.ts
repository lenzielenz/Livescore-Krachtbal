import * as THREE from 'three'

import { canvasTex } from './stadion'

// Een echte krachtbal in 3D: een lederen bal uit acht stroken (zoals de partjes van een meloen)
// die aan beide kanten samenkomen in een klein rond kapje. De naden liggen diep in de bal, elke
// strook bolt wat op, en op één strook staat KRACHTBAL, van kapje naar kapje.
//
// De vorm zit in de geometrie zelf (de naden zijn echte groeven, dus het licht valt erin), en
// de groeven zijn ook donkerder gekleurd (vuil en schaduw in de naad).

const STROKEN = 8
/** Hoe groot het kapje aan elke kant is (hoek vanaf de pool, radialen). */
const KAP = 0.3
/** Diepte en breedte van een naad (fractie van de straal). */
const NAAD_DIEP = 0.055
const NAAD_BREED = 0.03

/**
 * De bol met stroken, kapjes en diepe naden. De polen liggen op de x-as (de kapjes zitten links en
 * rechts, zoals bij een bal die op de grond ligt), de tekst-strook kijkt naar +z.
 */
export function krachtbalGeometrie(straal: number, detail = 1): THREE.BufferGeometry {
  // De polen eerst op de y-as (zo lopen de uv's mee), op het einde gedraaid naar de x-as.
  const geo = new THREE.SphereGeometry(straal, Math.round(96 * detail), Math.round(72 * detail))
  const pos = geo.attributes.position as THREE.BufferAttribute
  const kleuren = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const deel = (Math.PI * 2) / STROKEN
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    const theta = Math.acos(Math.min(1, Math.abs(v.y)))
    // De naden van de stroken liggen tussen twee stroken; de tekst-strook ligt gecentreerd op +z.
    const phi = Math.atan2(v.x, v.z) + deel / 2
    const inStrook = ((phi % deel) + deel) % deel
    const naarNaad = Math.min(inStrook, deel - inStrook)
    let groef: number
    let bol: number
    if (theta < KAP) {
      // Het kapje: licht bol, met één ronde naad aan de rand.
      groef = KAP - theta
      bol = 0.018 * (1 - theta / KAP)
    } else {
      // Een strook: de afstand tot de dichtste naad over het oppervlak (zijnaad of kapnaad).
      groef = Math.min(naarNaad * Math.sin(theta), theta - KAP)
      // Elke strook bolt op naar het midden, minder dicht bij het kapje.
      bol = 0.032 * Math.sin((naarNaad / (deel / 2)) * (Math.PI / 2)) * Math.min(1, (theta - KAP) / 0.35)
    }
    const naad = Math.exp(-((groef / NAAD_BREED) ** 2))
    const r = 1 + bol - NAAD_DIEP * naad
    pos.setXYZ(i, v.x * r * straal, v.y * r * straal, v.z * r * straal)
    // Donker in de naad, een tikje lichter op de bolling.
    const k = 1 - 0.55 * naad + bol * 2
    kleuren.set([k, k, k], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(kleuren, 3))
  geo.computeVertexNormals()
  // Polen naar de x-as: de tekst loopt dan horizontaal, van kapje naar kapje.
  geo.rotateZ(Math.PI / 2)
  return geo
}

/** Het leder: een basiskleur met wat slijtage, en KRACHTBAL op de strook die naar voren kijkt. */
export function krachtbalTextuur(kleur: string, tekst = '#1c1206'): THREE.CanvasTexture {
  const W = 1024
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = kleur
  g.fillRect(0, 0, W, H)
  // Slijtage en nerf in het leder.
  let z = 4242
  const rnd = () => (z = (z * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)'
    const r = 1 + rnd() * 5
    g.beginPath()
    g.ellipse(rnd() * W, rnd() * H, r * (1 + rnd() * 2), r, rnd() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  // De tekst-strook: in de bol-uv's loopt u rond de pool-as en v van pool naar pool. De strook op
  // +z ligt rond u = 0.25; de tekst loopt dus in v, van kapje naar kapje (na het draaien van de
  // bol: van links naar rechts, rechtop).
  g.save()
  g.translate(W * 0.25, H / 2)
  g.rotate(Math.PI / 2)
  g.fillStyle = tekst
  g.font = `900 ${Math.round(H * 0.12)}px Impact, "Arial Black", Inter, system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // Dik en blokkerig, zoals de opdruk op het leder.
  g.strokeStyle = tekst
  g.lineWidth = H * 0.008
  g.lineJoin = 'round'
  g.strokeText('KRACHTBAL', 0, 0, H * 0.5)
  g.fillText('KRACHTBAL', 0, 0, H * 0.5)
  g.restore()
  const t = canvasTex(c)
  t.anisotropy = 8
  return t
}
