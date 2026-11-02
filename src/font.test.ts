import opentype from 'opentype.js'
import { describe, expect, it, vi } from 'vitest'
import { findRegion } from './faces'
import { CLEAR } from './geometry'
import type { Drawing, Stroke } from './types'

vi.stubGlobal('matchMedia', () => ({ matches: false }))

const line = (ax: number, ay: number, bx: number, by: number, width = 2): Stroke => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  sweep: 0,
  width,
  color: '#000',
})

/** 検査値が中身と合わない表の名前。Windows はこれが1つでもあるとフォントを拒否する。 */
function wrongCheckSums(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer)
  const wrong: string[] = []
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16
    const tag = String.fromCharCode(...new Uint8Array(buffer, at, 4))
    const start = view.getUint32(at + 8)
    const length = view.getUint32(at + 12)
    if (tag === 'head') continue // 中にファイル全体の検査値を持つので計算が別
    let sum = 0
    for (let p = 0; p < length; p += 4) {
      let word = 0
      for (let j = 0; j < 4; j++) word = word * 256 + (p + j < length ? view.getUint8(start + p + j) : 0)
      sum = (sum + word) % 2 ** 32
    }
    if (sum !== view.getUint32(at + 4)) wrong.push(tag)
  }
  return wrong
}

function windowsNames(buffer: ArrayBuffer) {
  const { names } = opentype.parse(buffer)
  return (names as unknown as { windows: Record<string, Record<string, string>> }).windows
}

describe('buildFont', () => {
  it('日本語の名前でもWindowsが読める形になる', async () => {
    const { buildFont, latinFamily } = await import('./font')
    const bar: Drawing = { strokes: [line(0, -20, 0, 20)], fills: [] }
    const buffer = buildFont('四角五線 Font', { あ: bar })
    expect(wrongCheckSums(buffer)).toEqual([])

    const windows = windowsNames(buffer)
    expect(windows.fontFamily.en).toBe(latinFamily('四角五線 Font'))
    expect(windows.fontFamily.en).toMatch(/^[\x20-\x7e]+$/)
    expect(windows.fontFamily.ja).toBe('四角五線 Font')
    expect(windows.fullName.ja).toBe('四角五線 Font Regular')
  })

  it('半角の名前はそのまま使う', async () => {
    const { buildFont } = await import('./font')
    const bar: Drawing = { strokes: [line(0, -20, 0, 20)], fills: [] }
    const windows = windowsNames(buildFont('My Font', { A: bar }))
    expect(windows.fontFamily.en).toBe('My Font')
    expect(windows.fontFamily.ja).toBeUndefined()
  })

  it('Windows用の行の高さが文字の枠全体を覆い、仮名があれば日本語フォントになる', async () => {
    const { buildFont } = await import('./font')
    const low: Drawing = { strokes: [line(0, 30, 0, 38)], fills: [] }
    const tall: Drawing = { strokes: [line(0, -50, 0, 50, 10)], fills: [] }

    const latin = opentype.parse(buildFont('Test', { A: low })).tables.os2
    expect(latin.usWinAscent).toBe(880)
    expect(latin.usWinDescent).toBe(120)
    expect(latin.ulCodePageRange1).toBe(1)

    const kana = opentype.parse(buildFont('Test', { あ: tall })).tables.os2
    expect(kana.usWinAscent).toBe(930)
    expect(kana.usWinDescent).toBe(170)
    expect(kana.ulCodePageRange1 & (1 << 17)).not.toBe(0)
  })

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

  it('透明な線は形にならず、文字の幅だけ広げる', async () => {
    const { buildFont, outline } = await import('./font')
    const bar = line(0, -20, 0, 20)
    const clear = { ...line(-30, 0, -30, 1), color: CLEAR }
    const framed: Drawing = { strokes: [bar, clear], fills: [] }
    expect(outline(framed)).toEqual(outline({ strokes: [bar], fills: [] }))

    const font = opentype.parse(buildFont('Test', { I: framed, J: { strokes: [clear], fills: [] } }))
    const glyph = font.charToGlyph('I')
    expect(glyph.advanceWidth).toBe(320 + 120)
    expect(glyph.getBoundingBox().x1).toBe(360)
    expect(font.charToGlyph('J').path.commands).toHaveLength(0)
  })

  it('日本語の名前でも管理名は半角英数字になる', async () => {
    const { postScriptName } = await import('./font')
    expect(postScriptName('My Font')).toBe('MyFont-Regular')
    expect(postScriptName('テスト結')).toMatch(/^YUIFont[0-9A-F]+-Regular$/)
    expect(postScriptName('結 Font')).toMatch(/^YUIFont[0-9A-F]+-Regular$/)
  })
})
