import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Minder harde hoeken: een doos met licht afgeronde ribben. Zo vangt elke rand een glimlicht, zoals
// bij echte meubels, panelen en carrosserie. De straal schaalt mee met de doos (een dun plaatje
// krijgt een heel klein randje), zodat niets er opgeblazen uitziet.
export function rondeDoos(w: number, h: number, d: number, straal?: number): THREE.BufferGeometry {
  const kleinste = Math.min(w, h, d)
  const r = Math.min(straal ?? 0.035, kleinste * 0.3)
  if (r < 0.004) return new THREE.BoxGeometry(w, h, d)
  return new RoundedBoxGeometry(w, h, d, 2, r)
}
