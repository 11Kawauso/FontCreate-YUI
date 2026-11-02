import { describe, expect, it } from 'vitest'
import { findRegion } from './faces'
import { CLEAR, strokePoints, subStroke } from './geometry'
import { contactPoints, findPiece, removePiece } from './trim'
import type { Stroke } from './types'

const line = (ax: number, ay: number, bx: number, by: number, sweep = 0): Stroke => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  sweep,
  width: 1,
  color: '#000',
})

const erase = (strokes: Stroke[], x: number, y: number, reach = 0.5) => {
  const piece = findPiece(strokes, { x, y }, reach)
  return piece ? removePiece(strokes, piece) : null
}

describe('接点まで消す', () => {
  it('交差した線は、交点までだけ消える', () => {
    const across = line(-10, 0, 10, 0)
    const down = line(0, -10, 0, 10)
    const next = erase([across, down], 5, 0)!
    expect(next).toHaveLength(2)
    expect(next[0].a).toEqual({ x: -10, y: 0 })
    expect(next[0].b.x).toBeCloseTo(0)
    expect(next[1]).toEqual(down)
  })

  it('両側に接点があれば、その間だけ消えて2本に分かれる', () => {
    const next = erase([line(-10, 0, 10, 0), line(-5, -5, -5, 5), line(5, -5, 5, 5)], 0, 0)!
    expect(next).toHaveLength(4)
    expect(next[0].b.x).toBeCloseTo(-5)
    expect(next[1].a.x).toBeCloseTo(5)
  })

  it('線の途中に別の線の端が乗っていても接点になる', () => {
    const next = erase([line(-10, 0, 10, 0), line(3, 0, 3, 8)], -2, 0)!
    expect(next[0].a.x).toBeCloseTo(3)
    expect(next[0].b.x).toBe(10)
  })

  it('接点がなければ1本まるごと消える', () => {
    expect(erase([line(-10, 0, 10, 0)], 2, 0)).toEqual([])
  })

  it('届かなければ何も消えない', () => {
    expect(erase([line(-10, 0, 10, 0)], 0, 5)).toBeNull()
  })

  it('曲線は同じ円のまま切れる', () => {
    const arc = line(-10, 0, 10, 0, 180)
    const next = erase([arc, line(0, -20, 0, -5)], 7, -7)!
    expect(next).toHaveLength(2)
    expect(next[0].sweep).toBeCloseTo(90, 0)
    for (const p of strokePoints(next[0])) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 3)
    expect(next[0].b.x).toBeCloseTo(0, 3)
    expect(next[0].b.y).toBeCloseTo(-10, 3)
  })

  it('曲線の頂点で別の線に接していても区切られる', () => {
    expect(contactPoints(line(-10, 0, 10, 0, 180), [line(-20, -10, 20, -10)])).toEqual([0, 0.5, 1])
  })

  it('透明な線は接点にならない', () => {
    const clear = { ...line(0, -10, 0, 10), color: CLEAR }
    expect(erase([line(-10, 0, 10, 0), clear], 5, 0)).toEqual([clear])
  })

  it('両端でつながっているだけなら区切らない', () => {
    expect(contactPoints(line(0, 0, 10, 0), [line(10, 0, 10, 10), line(0, 0, 0, 10)])).toEqual([0, 1])
  })
})

describe('切った線と塗りつぶし', () => {
  it('曲線の外側で切った線でも囲いになる', () => {
    const arc = line(-10, 0, 10, 0, 180)
    const p = subStroke(arc, 0.41, 0.59)
    const lines = [strokePoints(arc), [p.a, { x: 0, y: -30 }], [{ x: 0, y: -30 }, p.b]]
    expect(findRegion(lines, { x: 0, y: -15 })).not.toBeNull()
  })

  it('十字の腕を消しても、残りの線で囲いが閉じる', () => {
    const square = [line(0, 0, 10, 0), line(10, 0, 10, 10), line(10, 10, 0, 10), line(0, 10, 0, 0)]
    const overhang = line(5, -5, 5, 15)
    const next = erase(erase([...square, overhang], 5, -3)!, 5, 13)!
    expect(next).toHaveLength(5)
    const region = findRegion(next.map(strokePoints), { x: 2, y: 5 })
    expect(region).not.toBeNull()
  })
})
