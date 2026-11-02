import ClipperLib from 'clipper-lib'
import opentype from 'opentype.js'
import { setOf } from './charset'
import { BASELINE_Y, drawingBounds, isClear, strokePoints } from './geometry'
import type { Drawing, Vec } from './types'

/*
 * 1マス = 10ユニット、制作エリア全体が1文字分(1000ユニット)。
 * 基準線の高さが y=0 になる。
 */
const UNIT = 10
const EM = 1000
const ASCENDER = BASELINE_Y * UNIT + EM / 2
const DESCENDER = ASCENDER - EM
const BEARING = 60
/** 輪郭計算は小数第1位まで整数で扱う */
const PRECISION = 10

type IntPath = { X: number; Y: number }[]

const toInt = (p: Vec) => ({
  X: Math.round(p.x * UNIT * PRECISION),
  Y: Math.round((BASELINE_Y - p.y) * UNIT * PRECISION),
})

function union(paths: IntPath[], fill: ClipperLib.PolyFillType): IntPath[] {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true)
  const out: IntPath[] = []
  clipper.Execute(ClipperLib.ClipType.ctUnion, out, fill, fill)
  return out
}

/** 線の太さと塗りをすべて1つの輪郭に合体させる。透明な線は輪郭に入れない。 */
export function outline(d: Drawing): IntPath[] {
  const parts: IntPath[] = []
  for (const f of d.fills) {
    parts.push(...union(f.rings.map((r) => r.map(toInt)), ClipperLib.PolyFillType.pftEvenOdd))
  }
  for (const s of d.strokes) {
    if (isClear(s)) continue
    const offset = new ClipperLib.ClipperOffset(2, PRECISION / 2)
    offset.AddPath(strokePoints(s).map(toInt), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound)
    const out: IntPath[] = []
    offset.Execute(out, (s.width / 2) * UNIT * PRECISION)
    parts.push(...out)
  }
  const merged = union(parts, ClipperLib.PolyFillType.pftNonZero)
  return ClipperLib.Clipper.CleanPolygons(merged, PRECISION * 0.3) as IntPath[]
}

function glyphFor(char: string, drawing: Drawing): opentype.Glyph {
  const paths = outline(drawing)
  // 文字の幅は透明な線まで含めた範囲で決まる
  const area = drawingBounds(drawing)
  const minX = (area?.minX ?? 0) * UNIT
  const maxX = (area?.maxX ?? 0) * UNIT
  const proportional = setOf(char).proportional && area !== null
  const shift = proportional ? BEARING - minX : EM / 2
  const path = new opentype.Path()
  for (const ring of paths) {
    ring.forEach((p, i) => {
      const x = Math.round(p.X / PRECISION + shift)
      const y = Math.round(p.Y / PRECISION)
      if (i) path.lineTo(x, y)
      else path.moveTo(x, y)
    })
    path.close()
  }
  const code = char.codePointAt(0)!
  return new opentype.Glyph({
    name: `uni${code.toString(16).toUpperCase().padStart(4, '0')}`,
    unicode: code,
    advanceWidth: proportional ? Math.round(maxX - minX + BEARING * 2) : EM,
    path,
  })
}

/** フォント内部の管理名は半角英数字のみ。日本語の名前は番号に置き換える。 */
export function postScriptName(name: string): string {
  const ascii = name.replace(/[^A-Za-z0-9]/g, '')
  if (ascii && ascii.length === name.replace(/\s/g, '').length) return `${ascii}-Regular`
  let hash = 0
  for (const c of name) hash = (Math.imul(hash, 31) + c.codePointAt(0)!) >>> 0
  return `YUIFont${hash.toString(16).toUpperCase()}-Regular`
}

export function buildFont(name: string, glyphs: Record<string, Drawing>): ArrayBuffer {
  const list = [
    new opentype.Glyph({ name: '.notdef', advanceWidth: EM / 2, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 0x20, advanceWidth: 300, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'uni3000', unicode: 0x3000, advanceWidth: EM, path: new opentype.Path() }),
  ]
  for (const char of Object.keys(glyphs).sort()) list.push(glyphFor(char, glyphs[char]))
  const family = name.trim() || 'YUI Font'
  const font = new opentype.Font({
    familyName: family,
    styleName: 'Regular',
    postScriptName: postScriptName(family),
    unitsPerEm: EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs: list,
  })
  return font.toArrayBuffer()
}
