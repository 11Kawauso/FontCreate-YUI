import { pointInRing, ringArea } from './geometry'
import type { Vec } from './types'

/*
 * 塗りつぶしの範囲探し。
 * すべての線を交点で切り分けて「地図」を作り、線に囲まれた区画を一周なぞって求める。
 * 区画の形をそのまま持つので、拡大してもフォントにしても輪郭が崩れない。
 */

interface Seg {
  a: Vec
  b: Vec
  ts: number[]
}

interface Cycle {
  pts: Vec[]
  area: number
  comp: number
}

const EPS = 1e-9
const CELL = 1e-3

/** 計算誤差でわずかにずれた同じ点を、1つの頂点にまとめる。 */
class VertexPool {
  pts: Vec[] = []
  private buckets = new Map<string, number[]>()

  id(p: Vec): number {
    const cx = Math.round(p.x / CELL)
    const cy = Math.round(p.y / CELL)
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const v of this.buckets.get(`${cx + i},${cy + j}`) ?? []) {
          if (Math.hypot(this.pts[v].x - p.x, this.pts[v].y - p.y) < CELL) return v
        }
      }
    }
    const id = this.pts.length
    this.pts.push(p)
    const key = `${cx},${cy}`
    const list = this.buckets.get(key)
    if (list) list.push(id)
    else this.buckets.set(key, [id])
    return id
  }
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

function splitSegments(s: Seg, t: Seg): void {
  const d1x = s.b.x - s.a.x
  const d1y = s.b.y - s.a.y
  const d2x = t.b.x - t.a.x
  const d2y = t.b.y - t.a.y
  const denom = cross(d1x, d1y, d2x, d2y)
  const ox = t.a.x - s.a.x
  const oy = t.a.y - s.a.y
  if (Math.abs(denom) < EPS) {
    if (Math.abs(cross(ox, oy, d1x, d1y)) > 1e-7) return
    const l1 = d1x * d1x + d1y * d1y
    const l2 = d2x * d2x + d2y * d2y
    const onS = (p: Vec) => ((p.x - s.a.x) * d1x + (p.y - s.a.y) * d1y) / l1
    const onT = (p: Vec) => ((p.x - t.a.x) * d2x + (p.y - t.a.y) * d2y) / l2
    for (const u of [onS(t.a), onS(t.b)]) if (u > 0 && u < 1) s.ts.push(u)
    for (const u of [onT(s.a), onT(s.b)]) if (u > 0 && u < 1) t.ts.push(u)
    return
  }
  const u = cross(ox, oy, d2x, d2y) / denom
  const v = cross(ox, oy, d1x, d1y) / denom
  if (u < -EPS || u > 1 + EPS || v < -EPS || v > 1 + EPS) return
  s.ts.push(Math.min(1, Math.max(0, u)))
  t.ts.push(Math.min(1, Math.max(0, v)))
}

function buildCycles(polylines: Vec[][]): Cycle[] {
  const segs: Seg[] = []
  for (const line of polylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]
      const b = line[i + 1]
      if (a.x !== b.x || a.y !== b.y) segs.push({ a, b, ts: [0, 1] })
    }
  }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const sx0 = Math.min(s.a.x, s.b.x) - EPS
    const sx1 = Math.max(s.a.x, s.b.x) + EPS
    const sy0 = Math.min(s.a.y, s.b.y) - EPS
    const sy1 = Math.max(s.a.y, s.b.y) + EPS
    for (let j = i + 1; j < segs.length; j++) {
      const t = segs[j]
      if (Math.max(t.a.x, t.b.x) < sx0 || Math.min(t.a.x, t.b.x) > sx1) continue
      if (Math.max(t.a.y, t.b.y) < sy0 || Math.min(t.a.y, t.b.y) > sy1) continue
      splitSegments(s, t)
    }
  }

  const pool = new VertexPool()
  const adj = new Map<number, Set<number>>()
  const link = (u: number, v: number) => {
    if (!adj.has(u)) adj.set(u, new Set())
    adj.get(u)!.add(v)
  }
  for (const s of segs) {
    const ts = [...s.ts].sort((x, y) => x - y)
    let prev = -1
    for (const t of ts) {
      const id = pool.id({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t })
      if (prev >= 0 && prev !== id) {
        link(prev, id)
        link(id, prev)
      }
      prev = id
    }
  }

  // 行き止まりの線は囲いに関係ないので取り除く
  const stack = [...adj.keys()].filter((v) => adj.get(v)!.size === 1)
  while (stack.length) {
    const v = stack.pop()!
    const nbs = adj.get(v)
    if (!nbs || nbs.size !== 1) continue
    const [u] = nbs
    adj.delete(v)
    adj.get(u)!.delete(v)
    if (adj.get(u)!.size === 1) stack.push(u)
  }

  // つながっている線のかたまりごとに番号を振る
  const comp = new Map<number, number>()
  let compCount = 0
  for (const start of adj.keys()) {
    if (comp.has(start)) continue
    const c = compCount++
    const queue = [start]
    comp.set(start, c)
    while (queue.length) {
      for (const n of adj.get(queue.pop()!)!) {
        if (!comp.has(n)) {
          comp.set(n, c)
          queue.push(n)
        }
      }
    }
  }

  const order = new Map<number, number[]>()
  const pts = pool.pts
  for (const [v, nbs] of adj) {
    const angle = (n: number) => Math.atan2(pts[n].y - pts[v].y, pts[n].x - pts[v].x)
    order.set(v, [...nbs].sort((p, q) => angle(p) - angle(q)))
  }

  // 常に一番左へ曲がってなぞると、区画の縁を一周できる
  const seen = new Set<string>()
  const cycles: Cycle[] = []
  for (const [start, nbs] of adj) {
    for (const first of nbs) {
      if (seen.has(`${start},${first}`)) continue
      const ring: Vec[] = []
      let u = start
      let v = first
      while (!seen.has(`${u},${v}`)) {
        seen.add(`${u},${v}`)
        ring.push(pts[u])
        const list = order.get(v)!
        const w = list[(list.indexOf(u) - 1 + list.length) % list.length]
        u = v
        v = w
      }
      cycles.push({ pts: simplify(ring), area: ringArea(ring), comp: comp.get(start)! })
    }
  }
  return cycles
}

function simplify(ring: Vec[]): Vec[] {
  const out: Vec[] = []
  for (let i = 0; i < ring.length; i++) {
    const p = ring[(i + ring.length - 1) % ring.length]
    const c = ring[i]
    const n = ring[(i + 1) % ring.length]
    if (Math.abs(cross(c.x - p.x, c.y - p.y, n.x - c.x, n.y - c.y)) > 1e-7) out.push(c)
  }
  return out.length >= 3 ? out : ring
}

/** p を囲む一番小さな区画の輪郭を返す。囲まれていなければ null。 */
export function findRegion(polylines: Vec[][], p: Vec): Vec[][] | null {
  const cycles = buildCycles(polylines)
  const faces = cycles.filter((c) => c.area > 1e-9)
  const containing = faces.filter((c) => pointInRing(p, c.pts))
  if (containing.length === 0) return null
  const face = containing.reduce((m, c) => (c.area < m.area ? c : m))

  // 区画の中に別の線のかたまりが浮いていたら、そこは穴になる
  const rings = [face.pts]
  for (const outer of cycles) {
    if (outer.area >= 0 || outer.comp === face.comp) continue
    const q = outer.pts[0]
    if (!pointInRing(q, face.pts)) continue
    const nested = faces.some(
      (g) => g !== face && g.comp !== outer.comp && g.area < face.area && pointInRing(q, g.pts),
    )
    if (!nested) rings.push(outer.pts)
  }
  return rings
}
