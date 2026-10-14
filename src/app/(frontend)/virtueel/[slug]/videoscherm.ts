import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'

import type { StadionThema } from '@/lib/virtueel'

// Echte krachtbalwedstrijden op de schermen: het grote ledscherm in het stadion, en het doek in de
// cinema in de kelder. Hoe: een YouTube-speler (privacyvriendelijke nocookie-variant, gedempt
// zodat hij vanzelf mag starten) staat in een CSS3D-laag ACHTER het WebGL-canvas, precies op de
// plek van het scherm. In het canvas "ponsen" we op die plek een gat (een vlak dat volledig
// doorzichtig schrijft), zodat je door het canvas heen de video ziet — en alles wat ervoor staat
// (publiek, spelers, rook, stoelen) gewoon ervoor blijft staan. Lukt de video niet (geen netwerk,
// geblokkeerd), dan zie je het clubbeeld.
// Een scherm laadt zijn video pas als je het voor het eerst kan zien (de cinema dus pas in de kelder).

/** De wedstrijd op het grote scherm in het stadion. */
export const VIDEO_ID = 'MnA_u2gW4Zc'
/** De film in de cinema in de kelder. */
export const CINEMA_VIDEO_ID = 'RfcHTepqoxE'
const PX = 1280
const PY = 720
const bron = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0&enablejsapi=1`
const HERKOMST = 'https://www.youtube-nocookie.com'

export type SchermPlek = {
  /** Midden van het scherm, breedte en hoogte (m), en de draaiing rond y (0 = kijkt naar +z). */
  x: number
  y: number
  z: number
  b: number
  h: number
  ry: number
  /** Heeft het zin om dit scherm nu te tekenen (de camera staat ervoor en dichtbij genoeg)? */
  zichtbaar: (camera: THREE.Camera) => boolean
  titel: string
  /** Welke YouTube-video (standaard de stadionwedstrijd). */
  videoId?: string
}

export type Videoscherm = {
  maat: (w: number, h: number) => void
  render: (camera: THREE.PerspectiveCamera) => void
  geluid: (aan: boolean) => void
  dispose: () => void
}

export function bouwVideoscherm(scene: THREE.Scene, opt: { houder: HTMLElement; thema: StadionThema; schermen: SchermPlek[] }): Videoscherm {
  const { houder, thema } = opt
  const css = new CSS3DRenderer()
  css.domElement.className = 'vk-videolaag'
  houder.prepend(css.domElement)
  const cssScene = new THREE.Scene()
  let geluidAan = false

  const schermen = opt.schermen.map((plek) => {
    const doos = document.createElement('div')
    doos.className = 'vk-video'
    doos.style.width = `${PX}px`
    doos.style.height = `${PY}px`
    doos.style.setProperty('--prim', thema.primair)
    doos.style.setProperty('--sec', thema.secundair)
    doos.style.display = 'none'
    const reserve = document.createElement('div')
    reserve.className = 'vk-video-reserve'
    reserve.textContent = `${thema.naam} · KRACHTBAL TV`
    doos.appendChild(reserve)
    const iframe = document.createElement('iframe')
    iframe.title = plek.titel
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.tabIndex = -1
    doos.appendChild(iframe)
    const obj = new CSS3DObject(doos)
    const voor = new THREE.Vector3(Math.sin(plek.ry), 0, Math.cos(plek.ry)).multiplyScalar(0.02)
    obj.position.set(plek.x + voor.x, plek.y, plek.z + voor.z)
    obj.rotation.y = plek.ry
    obj.scale.setScalar(plek.b / PX)
    cssScene.add(obj)
    // Het gat in het canvas: schrijft (0,0,0,0) en diepte, zodat wat ervoor staat er wel over tekent.
    const gat = new THREE.Mesh(
      new THREE.PlaneGeometry(plek.b, plek.h),
      new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: false, blending: THREE.NoBlending, fog: false, toneMapped: false }),
    )
    gat.position.copy(obj.position)
    gat.rotation.y = plek.ry
    gat.visible = false
    scene.add(gat)
    // Speelt deze video al? (Het commando kan pas als de speler geladen is.)
    iframe.addEventListener('load', () => stuurGeluid(iframe))
    return { plek, doos, iframe, gat, geladen: false }
  })

  function stuurGeluid(iframe: HTMLIFrameElement) {
    iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: geluidAan ? 'unMute' : 'mute', args: [] }), HERKOMST)
    if (geluidAan) iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), HERKOMST)
  }

  return {
    maat(w, h) {
      css.setSize(w, h)
    },
    render(camera) {
      let iets = false
      for (const s of schermen) {
        const zichtbaar = s.plek.zichtbaar(camera)
        if (zichtbaar && !s.geladen) {
          s.geladen = true
          s.iframe.src = bron(s.plek.videoId ?? VIDEO_ID)
        }
        s.doos.style.display = zichtbaar ? '' : 'none'
        s.gat.visible = zichtbaar
        iets ||= zichtbaar
      }
      if (iets) css.render(cssScene, camera)
    },
    geluid(aan) {
      geluidAan = aan
      for (const s of schermen) if (s.geladen) stuurGeluid(s.iframe)
    },
    dispose() {
      css.domElement.remove()
    },
  }
}
