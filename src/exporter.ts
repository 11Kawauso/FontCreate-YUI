import { zipSync } from 'fflate'
import { CHAR_SETS, setOf } from './charset'
import { paintFitted } from './render'
import { store } from './store'
import type { Drawing, Ruler } from './types'

const PNG_SIZE = 1024

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

function toPng(d: Drawing): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PNG_SIZE
  paintFitted(canvas.getContext('2d')!, d, PNG_SIZE)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNGの作成に失敗しました'))), 'image/png'),
  )
}

/** ファイル名に使えない記号を取り除く。 */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim() || 'font'
}

/** 右上のプレビューと同じ絵を、背景透過のPNGにする。 */
export async function exportPng(): Promise<void> {
  const name = store.activeChar ? setOf(store.activeChar).folder + '_' + store.activeChar : '文字'
  download(await toPng(store.drawing), `${name}.png`)
}

/** 表に保存した文字を、種類別のフォルダに分けてZIPにする。 */
export async function exportZip(): Promise<void> {
  const files: Record<string, Uint8Array> = {}
  for (const set of CHAR_SETS) {
    for (const group of set.groups) {
      for (const char of group.chars) {
        const glyph = store.glyphs[char]
        if (!glyph) continue
        files[`${set.folder}/${char}.png`] = new Uint8Array(await (await toPng(glyph)).arrayBuffer())
      }
    }
  }
  const zip = zipSync(files, { level: 0 })
  download(new Blob([zip as BlobPart], { type: 'application/zip' }), `${safeName(store.fontName)}_png.zip`)
}

/** フォントのインストールファイル(.otf)にする。 */
export async function exportFont(): Promise<void> {
  const { buildFont } = await import('./font')
  const buffer = buildFont(store.fontName, store.glyphs)
  download(new Blob([buffer], { type: 'font/otf' }), `${safeName(store.fontName)}.otf`)
}

interface ProjectFile {
  app: 'FontCreate-YUI'
  version: 1
  fontName: string
  glyphs: Record<string, Drawing>
  rulers: Ruler[]
}

/** 表全体を1つのファイルにまとめて保存する。 */
export function exportProject(): void {
  const data: ProjectFile = {
    app: 'FontCreate-YUI',
    version: 1,
    fontName: store.fontName,
    glyphs: store.glyphs,
    rulers: store.rulers,
  }
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName(store.fontName)}.yui.json`)
}

export function parseProject(text: string): ProjectFile {
  const data = JSON.parse(text)
  if (data?.app !== 'FontCreate-YUI' || typeof data.glyphs !== 'object') {
    throw new Error('フォントクリエイト・結のファイルではありません')
  }
  return data
}
