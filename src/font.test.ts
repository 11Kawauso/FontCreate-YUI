import opentype from 'opentype.js'
import { describe, expect, it, vi } from 'vitest'
import { findRegion } from './faces'
import type { Drawing, Stroke } from './types'

vi.stubGlobal('matchMedia', () => ({ matches: false }))

const line = (ax: number, ay: number, bx: number, by: number, width = 2): Stroke => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  sweep: 0,
  width,
  color: '#000',
})

describe('buildFont', () => {
  it('作ったフォントを読み戻せる', async () => {
    const { buildFont, outline } = await import('./font')
    const strokes = [line(-20, -20, 20, -20), line(20, -20, 20, 20), line(20, 20, -20, 20), line(-20, 20, -20, -20)]
    const region = findRegion(strokes.map((s) => [s.a, s.b]), { x: 0, y: 0 })!
    const filled: Drawing = { strokes, fills: [{ rings: region, color: '#000' }] }
    const hollow: Drawing = { strokes, fills: [] }

    expect(outline(filled)).toHaveLength(1)
    expect(outline(hollow)).toHaveLength(2)

    const buffer = buildFont('テスト Font', { A: filled, あ: hollow })
    const font = opentype.parse(buffer)
    expect(font.unitsPerEm).toBe(1000)
    const a = font.charToGlyph('A')
    const hira = font.charToGlyph('あ')
    expect(a.unicode).toBe(0x41)
    expect(a.advanceWidth).toBe(420 + 120)
    expect(hira.advanceWidth).toBe(1000)
    const box = a.getBoundingBox()
    expect(box.x1).toBe(60)
    expect(box.y2).toBe(590)
    expect(box.y1).toBe(170)
  })

  it('数字と半角記号は文字の幅に合わせ、全角記号は全角の幅になる', async () => {
    const { buildFont } = await import('./font')
    const bar: Drawing = { strokes: [line(0, -20, 0, 20)], fills: [] }
    const font = opentype.parse(buildFont('Test', { '1': bar, '!': bar, '/': bar, '、': bar, '？': bar }))
    expect(font.charToGlyph('1').advanceWidth).toBe(20 + 120)
    expect(font.charToGlyph('!').advanceWidth).toBe(20 + 120)
    expect(font.charToGlyph('/').unicode).toBe(0x2f)
    expect(font.charToGlyph('、').advanceWidth).toBe(1000)
    expect(font.charToGlyph('？').advanceWidth).toBe(1000)
  })

  it('日本語の名前でも管理名は半角英数字になる', async () => {
    const { postScriptName } = await import('./font')
    expect(postScriptName('My Font')).toBe('MyFont-Regular')
    expect(postScriptName('テスト結')).toMatch(/^YUIFont[0-9A-F]+-Regular$/)
    expect(postScriptName('結 Font')).toMatch(/^YUIFont[0-9A-F]+-Regular$/)
  })
})
