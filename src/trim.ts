import { TOUCH, distToPolyline, distToSegment, isClear, projectOnSegment, strokePoints, subStroke } from './geometry'
import type { Stroke, Vec } from './types'

/*
 * 「接点まで消す」消しゴムの計算。
 * 線を他の線との接点で区切り、消しゴムに一番近い1区間だけを取り除く。
 */

/** これより短い区間は作らない。接点が重なって、ごく短い切れ端が残るのを防ぐ。 */
const MIN_PIECE = TOUCH * 2

export interface Piece {
  index: number
  from: number
  to: number
}

/** ab と cd が交わるとき、ab の上の位置(0〜1)を返す。 */
function crossAt(a: Vec, b: Vec, c: Vec, d: Vec): number | null {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const cdx = d.x - c.x
  const cdy = d.y - c.y
  const acx = c.x - a.x
  const acy = c.y - a.y
  const denom = abx * cdy - aby * cdx
  if (Math.abs(denom) < 1e-12) return null
  const u = (acx * cdy - acy * cdx) / denom
  const v = (acx * aby - acy * abx) / denom
  const eps = 1e-9
  if (u < -eps || u > 1 + eps || v < -eps || v > 1 + eps) return null
  return Math.max(0, Math.min(1, u))
}

/** 線 s を others との接点で区切る位置(0〜1)を小さい順に返す。両端の 0 と 1 を含む。 */
export function contactPoints(s: Stroke, others: Stroke[]): number[] {
  const pts = strokePoints(s)
  const n = pts.length - 1
  const found: number[] = []
  let length = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    length += Math.hypot(b.x - a.x, b.y - a.y)
    for (const o of others) {
      const q = strokePoints(o)
      for (let j = 0; j + 1 < q.length; j++) {
        const u = crossAt(a, b, q[j], q[j + 1])
        if (u !== null) found.push((i + u) / n)
      }
      // 線の途中に別の線の端が乗っている場合
      for (const e of [o.a, o.b]) {
        if (distToSegment(e, a, b) <= TOUCH) found.push((i + projectOnSegment(e, a, b)) / n)
      }
    }
  }
  const gap = MIN_PIECE / length
  const cuts = [0]
  for (const t of found.sort((x, y) => x - y)) {
    if (t - cuts[cuts.length - 1] >= gap && 1 - t >= gap) cuts.push(t)
  }
  cuts.push(1)
  return cuts
}

/** p に一番近い「接点から接点まで」の区間を探す。reach の内に線がなければ null。 */
export function findPiece(strokes: Stroke[], p: Vec, reach: number): Piece | null {
  let best: Piece | null = null
  let bestDist = Infinity
  strokes.forEach((s, index) => {
    const limit = reach + s.width / 2
    if (distToPolyline(p, strokePoints(s)) > limit) return
    // 透明な線は文字の一部ではないので、接点として数えない
    const cuts = contactPoints(s, strokes.filter((o) => o !== s && !isClear(o)))
    for (let k = 0; k + 1 < cuts.length; k++) {
      const dist = distToPolyline(p, strokePoints(subStroke(s, cuts[k], cuts[k + 1])))
      if (dist <= limit && dist < bestDist) {
        bestDist = dist
        best = { index, from: cuts[k], to: cuts[k + 1] }
      }
    }
  })
  return best
}

/** 区間を取り除いた線の一覧を返す。残った部分は左右それぞれ1本の線になる。 */
export function removePiece(strokes: Stroke[], { index, from, to }: Piece): Stroke[] {
  const s = strokes[index]
  const kept: Stroke[] = []
  if (from > 0) kept.push(subStroke(s, 0, from))
  if (to < 1) kept.push(subStroke(s, to, 1))
  return [...strokes.slice(0, index), ...kept, ...strokes.slice(index + 1)]
}
