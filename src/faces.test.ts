import { describe, expect, it } from 'vitest'
import { findRegion } from './faces'
import { ringArea, strokePoints } from './geometry'
import type { Stroke, Vec } from './types'

const box = (x: number, y: number, w: number, h: number): Vec[][] => {
  const c = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
  return c.map((p, i) => [p, c[(i + 1) % 4]])
}

describe('findRegion', () => {
  it('四角形の中を見つける', () => {
    const r = findRegion(box(0, 0, 10, 10), { x: 5, y: 5 })
    expect(r).toHaveLength(1)
    expect(Math.abs(ringArea(r![0]))).toBeCloseTo(100)
  })

  it('囲まれていない場所では null', () => {
    expect(findRegion(box(0, 0, 10, 10), { x: 20, y: 5 })).toBeNull()
    expect(findRegion(box(0, 0, 10, 10).slice(0, 3), { x: 5, y: 5 })).toBeNull()
  })

  it('交差した線で分かれた区画ごとに塗れる', () => {
    const lines = [
      ...box(0, 0, 10, 10),
      [{ x: 5, y: -2 }, { x: 5, y: 12 }],
    ]
    const r = findRegion(lines, { x: 2, y: 5 })
    expect(Math.abs(ringArea(r![0]))).toBeCloseTo(50)
  })

  it('はみ出した線があっても囲いを見つける', () => {
    const lines = [...box(0, 0, 10, 10), [{ x: 10, y: 10 }, { x: 20, y: 20 }]]
    expect(Math.abs(ringArea(findRegion(lines, { x: 5, y: 5 })![0]))).toBeCloseTo(100)
  })

  it('輪の形では内側が穴になる', () => {
    const lines = [...box(0, 0, 20, 20), ...box(5, 5, 10, 10)]
    const ring = findRegion(lines, { x: 2, y: 2 })
    expect(ring).toHaveLength(2)
    const inner = findRegion(lines, { x: 10, y: 10 })
    expect(inner).toHaveLength(1)
    expect(Math.abs(ringArea(inner![0]))).toBeCloseTo(100)
  })

  it('穴の中の島は、外側の輪の穴に数えない', () => {
    const lines = [...box(0, 0, 30, 30), ...box(5, 5, 20, 20), ...box(10, 10, 10, 10)]
    expect(findRegion(lines, { x: 2, y: 2 })).toHaveLength(2)
    expect(findRegion(lines, { x: 7, y: 7 })).toHaveLength(2)
  })

  it('円弧4本の円の中を見つける', () => {
    const c: Vec[] = [
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
    ]
    const arcs = c.map((a, i): Vec[] => {
      const s: Stroke = { a, b: c[(i + 1) % 4], sweep: 90, width: 1, color: '#000' }
      return strokePoints(s)
    })
    const r = findRegion(arcs, { x: 1, y: 2 })
    expect(Math.abs(ringArea(r![0]))).toBeCloseTo(Math.PI * 100, -1)
  })

  it('円弧は左右どちらにも正しく膨らむ', () => {
    const base = { a: { x: -10, y: 0 }, b: { x: 10, y: 0 }, width: 1, color: '#000' }
    const left = strokePoints({ ...base, sweep: 180 })
    const right = strokePoints({ ...base, sweep: -180 })
    expect(left[Math.floor(left.length / 2)].y).toBeCloseTo(-10, 1)
    expect(right[Math.floor(right.length / 2)].y).toBeCloseTo(10, 1)
  })
})
