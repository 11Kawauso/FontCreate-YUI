import type { Drawing, Stroke, Vec } from './types'

/** 制作エリアは中心(0,0)から上下左右に50マス。 */
export const BOARD = 50
/** フォントにしたときに文字の足元がそろう高さ。 */
export const BASELINE_Y = 38

/** 線を折れ線の点列にする。曲線は円弧を細かく刻む。 */
export function strokePoints(s: Stroke): Vec[] {
  if (!s.sweep) return [s.a, s.b]
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return [s.a, s.b]
  const sweep = (s.sweep * Math.PI) / 180
  const half = Math.abs(sweep) / 2
  const radius = len / (2 * Math.sin(half))
  const side = Math.sign(sweep)
  // 画面上で進行方向の左を指す単位ベクトル(y は下向き)
  const lx = dy / len
  const ly = -dx / len
  const d = radius * Math.cos(half)
  const cx = (s.a.x + s.b.x) / 2 - lx * d * side
  const cy = (s.a.y + s.b.y) / 2 - ly * d * side
  const vx = s.a.x - cx
  const vy = s.a.y - cy
  const n = Math.max(6, Math.ceil(Math.abs(s.sweep) / 4))
  const pts: Vec[] = [s.a]
  for (let i = 1; i < n; i++) {
    const t = (sweep * i) / n
    const c = Math.cos(t)
    const k = Math.sin(t)
    pts.push({ x: cx + vx * c - vy * k, y: cy + vx * k + vy * c })
  }
  pts.push(s.b)
  return pts
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function drawingBounds(d: Drawing): Bounds | null {
  let b: Bounds | null = null
  const add = (x: number, y: number, pad: number) => {
    if (!b) b = { minX: x - pad, minY: y - pad, maxX: x + pad, maxY: y + pad }
    else {
      b.minX = Math.min(b.minX, x - pad)
      b.minY = Math.min(b.minY, y - pad)
      b.maxX = Math.max(b.maxX, x + pad)
      b.maxY = Math.max(b.maxY, y + pad)
    }
  }
  for (const f of d.fills) for (const r of f.rings) for (const p of r) add(p.x, p.y, 0)
  for (const s of d.strokes) for (const p of strokePoints(s)) add(p.x, p.y, s.width / 2)
  return b
}

export function isEmpty(d: Drawing): boolean {
  return d.strokes.length === 0 && d.fills.length === 0
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function distToPolyline(p: Vec, pts: Vec[]): number {
  let best = Infinity
  for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]))
  return best
}

export function pointInRing(p: Vec, ring: Vec[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 外周と穴をまとめた偶奇判定。 */
export function pointInRings(p: Vec, rings: Vec[][]): boolean {
  let inside = false
  for (const r of rings) if (pointInRing(p, r)) inside = !inside
  return inside
}

export function ringArea(ring: Vec[]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j].x * ring[i].y - ring[i].x * ring[j].y
  }
  return sum / 2
}

export interface Mirror {
  map: (p: Vec) => Vec
  /** 鏡写しで曲がる向きが反転するか */
  flips: boolean
}

/** 対称設定に応じた写し先の一覧(元の位置は含まない)。 */
export function mirrors(mirrorX: boolean, mirrorY: boolean): Mirror[] {
  const list: Mirror[] = []
  if (mirrorX) list.push({ map: (p) => ({ x: -p.x, y: p.y }), flips: true })
  if (mirrorY) list.push({ map: (p) => ({ x: p.x, y: -p.y }), flips: true })
  if (mirrorX && mirrorY) list.push({ map: (p) => ({ x: -p.x, y: -p.y }), flips: false })
  return list
}

export function mirrorStroke(s: Stroke, m: Mirror): Stroke {
  return { ...s, a: m.map(s.a), b: m.map(s.b), sweep: m.flips ? -s.sweep : s.sweep }
}

function samePoint(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y
}

export function sameStroke(s: Stroke, t: Stroke): boolean {
  if (s.width !== t.width || s.color !== t.color) return false
  return (
    (samePoint(s.a, t.a) && samePoint(s.b, t.b) && s.sweep === t.sweep) ||
    (samePoint(s.a, t.b) && samePoint(s.b, t.a) && s.sweep === -t.sweep)
  )
}
