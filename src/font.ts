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
/** 対応する文字の範囲の印。JIS があると Word などの日本語フォント欄に出る。 */
const CODE_PAGE_LATIN = 1
const CODE_PAGE_JIS = 1 << 17
/** プレビューと同じ大きさで書き出すときの、1文字の枠の余白(3%) */
const FIT_PAD = 30

type IntPath = { X: number; Y: number }[]

/** 全文字に同じようにかける拡大と移動。bearing は英数字の左右の余白。 */
interface Placement {
  scale: number
  dx: number
  dy: number
  bearing: number
}

const AS_DRAWN: Placement = { scale: 1, dx: 0, dy: 0, bearing: BEARING }

/** 全文字を合わせた範囲が1文字の枠に収まる配置。倍率が共通なので、文字どうしの大きさの比と線の太さの比は変わらない。 */
function fitPlacement(glyphs: Record<string, Drawing>): Placement {
  const boxes = Object.values(glyphs).flatMap((d) => drawingBounds(d) ?? [])
  if (boxes.length === 0) return AS_DRAWN
  const minX = Math.min(...boxes.map((b) => b.minX))
  const maxX = Math.max(...boxes.map((b) => b.maxX))
  const minY = Math.min(...boxes.map((b) => b.minY))
  const maxY = Math.max(...boxes.map((b) => b.maxY))
  const size = Math.max(maxX - minX, maxY - minY, 0.001) * UNIT
  const scale = (EM - FIT_PAD * 2) / size
  return {
    scale,
    dx: -((minX + maxX) / 2) * UNIT * scale,
    dy: (BASELINE_Y - (BASELINE_Y - (minY + maxY) / 2) * scale) * UNIT,
    bearing: FIT_PAD,
  }
}

const toInt = (p: Vec, scale: number) => ({
  X: Math.round(p.x * UNIT * scale * PRECISION),
  Y: Math.round((BASELINE_Y - p.y) * UNIT * scale * PRECISION),
})

function union(paths: IntPath[], fill: ClipperLib.PolyFillType): IntPath[] {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true)
  const out: IntPath[] = []
  clipper.Execute(ClipperLib.ClipType.ctUnion, out, fill, fill)
  return out
}

/** 線の太さと塗りをすべて1つの輪郭に合体させる。透明な線は輪郭に入れない。 */
export function outline(d: Drawing, scale = 1): IntPath[] {
  const parts: IntPath[] = []
  for (const f of d.fills) {
    parts.push(...union(f.rings.map((r) => r.map((p) => toInt(p, scale))), ClipperLib.PolyFillType.pftEvenOdd))
  }
  for (const s of d.strokes) {
    if (isClear(s)) continue
    const offset = new ClipperLib.ClipperOffset(2, PRECISION / 2)
    offset.AddPath(strokePoints(s).map((p) => toInt(p, scale)), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound)
    const out: IntPath[] = []
    offset.Execute(out, (s.width / 2) * UNIT * scale * PRECISION)
    parts.push(...out)
  }
  const merged = union(parts, ClipperLib.PolyFillType.pftNonZero)
  return ClipperLib.Clipper.CleanPolygons(merged, PRECISION * 0.3) as IntPath[]
}

function glyphFor(char: string, drawing: Drawing, place: Placement): opentype.Glyph {
  const { scale, dx, dy, bearing } = place
  const paths = outline(drawing, scale)
  // 文字の幅は透明な線まで含めた範囲で決まる
  const area = drawingBounds(drawing)
  const minX = (area?.minX ?? 0) * UNIT * scale + dx
  const maxX = (area?.maxX ?? 0) * UNIT * scale + dx
  const proportional = setOf(char).proportional && area !== null
  const shift = proportional ? bearing - minX : EM / 2
  const path = new opentype.Path()
  for (const ring of paths) {
    ring.forEach((p, i) => {
      const x = Math.round(p.X / PRECISION + dx + shift)
      const y = Math.round(p.Y / PRECISION + dy)
      if (i) path.lineTo(x, y)
      else path.moveTo(x, y)
    })
    path.close()
  }
  const code = char.codePointAt(0)!
  return new opentype.Glyph({
    name: `uni${code.toString(16).toUpperCase().padStart(4, '0')}`,
    unicode: code,
    advanceWidth: proportional ? Math.round(maxX - minX + bearing * 2) : EM,
    path,
  })
}

function nameHash(name: string): string {
  let hash = 0
  for (const c of name) hash = (Math.imul(hash, 31) + c.codePointAt(0)!) >>> 0
  return hash.toString(16).toUpperCase()
}

/** フォント内部の管理名は半角英数字のみ。日本語の名前は番号に置き換える。 */
export function postScriptName(name: string): string {
  const ascii = name.replace(/[^A-Za-z0-9]/g, '')
  if (ascii && ascii.length === name.replace(/\s/g, '').length) return `${ascii}-Regular`
  return `YUIFont${nameHash(name)}-Regular`
}

/**
 * フォントの英語名。ここに日本語が入ると opentype.js が間違った検査値を書き、
 * Windows に「有効なフォントではありません」と拒否されるので、日本語の名前は別に持たせる。
 */
export function latinFamily(name: string): string {
  return /^[\x20-\x7e]+$/.test(name) ? name : `YUI Font ${nameHash(name)}`
}

export function buildFont(name: string, glyphs: Record<string, Drawing>, fit = false): ArrayBuffer {
  const place = fit ? fitPlacement(glyphs) : AS_DRAWN
  const list = [
    new opentype.Glyph({ name: '.notdef', advanceWidth: EM / 2, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 0x20, advanceWidth: 300, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'uni3000', unicode: 0x3000, advanceWidth: EM, path: new opentype.Path() }),
  ]
  for (const char of Object.keys(glyphs).sort()) list.push(glyphFor(char, glyphs[char], place))
  const family = name.trim() || 'YUI Font'
  const latin = latinFamily(family)
  const boxes = list.map((g) => g.getBoundingBox())
  const japanese = Object.keys(glyphs).some((c) => c.codePointAt(0)! >= 0x3000)
  const font = new opentype.Font({
    familyName: latin,
    styleName: 'Regular',
    postScriptName: postScriptName(family),
    manufacturer: 'FontCreate-YUI',
    unitsPerEm: EM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs: list,
  })
  Object.assign(font.tables.os2, {
    usWeightClass: 400,
    // Windows はこの高さで行の高さと表示の切り取りを決める
    usWinAscent: Math.max(ASCENDER, ...boxes.map((b) => b.y2)),
    usWinDescent: Math.max(-DESCENDER, ...boxes.map((b) => -b.y1)),
    ulCodePageRange1: japanese ? CODE_PAGE_LATIN | CODE_PAGE_JIS : CODE_PAGE_LATIN,
  })
  if (latin !== family) {
    const { windows } = font.names as unknown as { windows: Record<string, Record<string, string>> }
    windows.fontFamily.ja = family
    windows.fontSubfamily.ja = 'Regular'
    windows.fullName.ja = `${family} Regular`
  }
  return font.toArrayBuffer()
}
