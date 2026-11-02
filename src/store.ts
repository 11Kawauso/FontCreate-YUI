import { isEmpty } from './geometry'
import type { Drawing, Ruler, Settings } from './types'

export type Topic = 'settings' | 'drawing' | 'glyphs' | 'active'

interface Snapshot {
  drawing: Drawing
  rulers: Ruler[]
}

const blank = (): Drawing => ({ strokes: [], fills: [] })

const defaultSettings: Settings = {
  tool: 'line',
  curve: 'straight',
  sweep: 90,
  width: 1,
  eraserSize: 3,
  eraserMode: 'whole',
  clearLine: false,
  lineColor: '#1f1f1f',
  fillColor: '#1f1f1f',
  rulerColor: '#e5484d',
  showRulers: true,
  showCenter: true,
  showBaseline: true,
  mirrorX: false,
  mirrorY: false,
  chain: true,
  inputMode: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
  fontFit: true,
}

class Store {
  settings: Settings = { ...defaultSettings }
  drawing: Drawing = blank()
  rulers: Ruler[] = []
  glyphs: Record<string, Drawing> = {}
  activeChar: string | null = null
  fontName = 'YUI Font'

  private savedJson = JSON.stringify(blank())
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private listeners = new Map<Topic, Set<() => void>>()

  on(topic: Topic, fn: () => void): void {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set())
    this.listeners.get(topic)!.add(fn)
  }

  emit(topic: Topic): void {
    for (const fn of this.listeners.get(topic) ?? []) fn()
  }

  set(partial: Partial<Settings>): void {
    Object.assign(this.settings, partial)
    this.emit('settings')
  }

  private snapshot(): Snapshot {
    return {
      drawing: { strokes: [...this.drawing.strokes], fills: [...this.drawing.fills] },
      rulers: [...this.rulers],
    }
  }

  private restore(s: Snapshot): void {
    this.drawing = s.drawing
    this.rulers = s.rulers
    this.emit('drawing')
  }

  /** 元に戻せる形で変更する。fn の中では配列を入れ替えるだけで、線そのものは書き換えない。 */
  change(fn: () => void): void {
    this.begin()
    fn()
    this.emit('drawing')
  }

  /** 消しゴムのドラッグなど、一連の操作を1回分の「元に戻す」にまとめる。 */
  begin(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > 300) this.undoStack.shift()
    this.redoStack = []
  }

  /** begin の後で何も変わらなかったときに取り消す。 */
  discardBegin(): void {
    this.undoStack.pop()
  }

  undo(): void {
    const s = this.undoStack.pop()
    if (!s) return
    this.redoStack.push(this.snapshot())
    this.restore(s)
  }

  redo(): void {
    const s = this.redoStack.pop()
    if (!s) return
    this.undoStack.push(this.snapshot())
    this.restore(s)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get dirty(): boolean {
    return JSON.stringify(this.drawing) !== this.savedJson
  }

  get empty(): boolean {
    return isEmpty(this.drawing)
  }

  /** 今の絵を表のこの文字に保存する。 */
  saveTo(char: string): void {
    this.glyphs[char] = JSON.parse(JSON.stringify(this.drawing))
    this.activeChar = char
    this.savedJson = JSON.stringify(this.drawing)
    this.emit('glyphs')
    this.emit('active')
    this.emit('drawing')
  }

  /** 表の文字を開く。null なら白紙で描き始める。 */
  open(char: string | null): void {
    const saved = char ? this.glyphs[char] : undefined
    this.drawing = saved ? JSON.parse(JSON.stringify(saved)) : blank()
    this.activeChar = char
    this.savedJson = JSON.stringify(this.drawing)
    this.undoStack = []
    this.redoStack = []
    this.emit('active')
    this.emit('drawing')
  }

  removeGlyph(char: string): void {
    delete this.glyphs[char]
    this.emit('glyphs')
    if (this.activeChar === char) {
      this.savedJson = JSON.stringify(blank())
      this.emit('active')
      this.emit('drawing')
    }
  }

  /** 起動時に、前回の続きを復元する。 */
  hydrate(data: {
    settings?: Partial<Settings>
    drawing?: Drawing
    rulers?: Ruler[]
    glyphs?: Record<string, Drawing>
    activeChar?: string | null
    fontName?: string
  }): void {
    Object.assign(this.settings, data.settings)
    this.glyphs = data.glyphs ?? {}
    this.rulers = data.rulers ?? []
    this.activeChar = data.activeChar ?? null
    this.fontName = data.fontName ?? this.fontName
    this.drawing = data.drawing ?? blank()
    const saved = this.activeChar ? this.glyphs[this.activeChar] : undefined
    this.savedJson = JSON.stringify(saved ?? blank())
  }

  /** ファイルから読み込んだ内容で表を置き換える。 */
  replaceTable(glyphs: Record<string, Drawing>, rulers: Ruler[], fontName: string): void {
    this.glyphs = glyphs
    this.rulers = rulers
    this.fontName = fontName
    this.emit('glyphs')
    this.open(null)
  }
}

export const store = new Store()
