import { findRegion } from './faces'
import {
  BASELINE_Y,
  BOARD,
  CLEAR,
  distToPolyline,
  distToSegment,
  isClear,
  mirrorStroke,
  mirrors,
  pointInRing,
  pointInRings,
  ringArea,
  sameStroke,
  strokePoints,
  subStroke,
} from './geometry'
import { fitCanvas, paintClearLine, paintDrawing, traceStroke } from './render'
import { store } from './store'
import { findPiece, removePiece } from './trim'
import type { Fill, Ruler, Stroke, Vec } from './types'
import { Slot } from './ui/slot'
import { toast } from './ui/feedback'

const MAX_SCALE = 70
/** これ以上動いたらクリックではなくドラッグとみなす(画面上のピクセル) */
const DRAG_SLOP = 5

interface Pan {
  id: number
  x: number
  y: number
  moved: boolean
}

interface TouchPress {
  x: number
  y: number
  cancelled: boolean
}

/** 中央の制作エリア。表示の移動・拡大と、描く操作をすべて担当する。 */
export class Editor {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private w = 0
  private h = 0
  private dpr = 1
  private s = 6
  private ox = 0
  private oy = 0
  private fitted = false
  private queued = false

  /** 線や定規の始点 */
  private pending: Vec | null = null
  private chainStart: Vec | null = null
  private pressed: Vec | null = null
  private cursor: Vec | null = null
  private cursorScreen: Vec | null = null
  private pan: Pan | null = null
  private erasing = false
  private erased = false
  private lastErase: Vec | null = null
  private touches = new Map<number, Vec>()
  private press: TouchPress | null = null
  private pinch: { dist: number; cx: number; cy: number } | null = null

  constructor(
    private stage: HTMLElement,
    private slot: Slot,
  ) {
    this.canvas = stage.querySelector('canvas')!
    this.ctx = this.canvas.getContext('2d')!

    new ResizeObserver(() => this.resize()).observe(stage)
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e))
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e))
    this.canvas.addEventListener('pointercancel', (e) => this.onCancel(e))
    this.canvas.addEventListener('pointerleave', () => {
      this.cursor = null
      this.request()
    })
    stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
    stage.addEventListener('contextmenu', (e) => e.preventDefault())

    store.on('drawing', () => this.request())
    let tool = store.settings.tool
    store.on('settings', () => {
      if (store.settings.tool !== tool) {
        tool = store.settings.tool
        this.cancelLine()
      }
      this.updateCursor()
      this.request()
    })
    store.on('active', () => this.cancelLine())
    this.updateCursor()
    this.resize()
  }

  private request(): void {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => {
      this.queued = false
      this.draw()
    })
  }

  private updateCursor(): void {
    this.canvas.style.cursor = store.settings.tool === 'eraser' ? 'none' : 'crosshair'
  }

  cancelLine(): void {
    this.pending = null
    this.chainStart = null
    this.pressed = null
    this.request()
  }

  // ---- 表示 ----

  private resize(): void {
    const prevW = this.w
    const prevH = this.h
    this.w = this.stage.clientWidth
    this.h = this.stage.clientHeight
    this.dpr = fitCanvas(this.canvas, this.w, this.h)
    if (!this.fitted && this.w > 0) {
      this.fitted = true
      this.fitView()
      return
    }
    this.ox += (this.w - prevW) / 2
    this.oy += (this.h - prevH) / 2
    this.request()
  }

  private get minScale(): number {
    return (Math.min(this.w, this.h) / (BOARD * 2)) * 0.5
  }

  fitView(): void {
    const margin = store.settings.inputMode === 'touch' ? 28 : 40
    this.s = Math.max(1, (Math.min(this.w, this.h) - margin * 2) / (BOARD * 2))
    this.ox = this.w / 2
    this.oy = this.h / 2
    this.request()
  }

  private clampPan(): void {
    const reach = BOARD * this.s
    this.ox = Math.max(-reach, Math.min(this.w + reach, this.ox))
    this.oy = Math.max(-reach, Math.min(this.h + reach, this.oy))
  }

  private zoomAt(x: number, y: number, factor: number): void {
    const next = Math.max(this.minScale, Math.min(MAX_SCALE, this.s * factor))
    const k = next / this.s
    this.ox = x - (x - this.ox) * k
    this.oy = y - (y - this.oy) * k
    this.s = next
    this.clampPan()
    this.request()
  }

  private panBy(dx: number, dy: number): void {
    this.ox += dx
    this.oy += dy
    this.clampPan()
    this.request()
  }

  private toWorld(x: number, y: number): Vec {
    return { x: (x - this.ox) / this.s, y: (y - this.oy) / this.s }
  }

  private toScreen(p: Vec): Vec {
    return { x: p.x * this.s + this.ox, y: p.y * this.s + this.oy }
  }

  /** 引いて見ているときは点を間引き、見えている点にだけ吸い付く。 */
  private get step(): number {
    const s = this.s
    return s >= 4 ? 1 : s >= 2 ? 2 : s >= 0.8 ? 5 : 10
  }

  private snap(p: Vec): Vec {
    const st = this.step
    const round = (v: number) => Math.max(-BOARD, Math.min(BOARD, Math.round(v / st) * st))
    return { x: round(p.x) + 0, y: round(p.y) + 0 }
  }

  private localPos(e: PointerEvent | WheelEvent): Vec {
    const r = this.stage.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // ---- 入力 ----

  private onDown(e: PointerEvent): void {
    this.capture(e.pointerId)
    this.slot.hide()
    const pos = this.localPos(e)
    if (e.pointerType === 'touch') return this.touchDown(e.pointerId, pos)
    this.setCursor(pos)
    if (e.button === 1 || e.button === 2) {
      this.pan = { id: e.pointerId, x: pos.x, y: pos.y, moved: false }
      this.canvas.style.cursor = 'grabbing'
      return
    }
    if (e.button === 0) this.primaryDown(pos)
  }

  private capture(id: number): void {
    try {
      this.canvas.setPointerCapture(id)
    } catch {
      // 押した直後に指が離れていると失敗するが、描く操作には影響しない
    }
  }

  private primaryDown(pos: Vec): void {
    const world = this.toWorld(pos.x, pos.y)
    const { tool } = store.settings
    if (tool === 'fill') this.fillAt(world)
    else if (tool === 'eraser') this.startErase(world)
    else this.pressed = this.pickPoint(this.snap(world))
  }

  /** 点を選ぶ。始点があれば線が引ける。押した点を返す(ドラッグでも引けるように)。 */
  private pickPoint(pt: Vec): Vec | null {
    if (!this.pending) {
      this.pending = pt
      this.chainStart = pt
      return pt
    }
    this.finishLine(pt)
    return null
  }

  private finishLine(pt: Vec): void {
    const start = this.pending!
    if (start.x === pt.x && start.y === pt.y) {
      this.cancelLine()
      return
    }
    if (store.settings.tool === 'ruler') {
      this.addRuler(start, pt)
      this.cancelLine()
      return
    }
    this.addStrokes(start, pt)
    const closed = pt.x === this.chainStart?.x && pt.y === this.chainStart?.y
    if (store.settings.chain && !closed) this.pending = pt
    else this.cancelLine()
  }

  private newStroke(a: Vec, b: Vec): Stroke {
    const { curve, sweep, width, lineColor, clearLine } = store.settings
    const signed = curve === 'left' ? sweep : curve === 'right' ? -sweep : 0
    return { a, b, sweep: signed, width, color: clearLine ? CLEAR : lineColor }
  }

  private addStrokes(a: Vec, b: Vec): void {
    const { mirrorX, mirrorY } = store.settings
    const base = this.newStroke(a, b)
    const copies = [base, ...mirrors(mirrorX, mirrorY).map((m) => mirrorStroke(base, m))]
    store.change(() => {
      const strokes = [...store.drawing.strokes]
      for (const s of copies) if (!strokes.some((t) => sameStroke(s, t))) strokes.push(s)
      store.drawing = { ...store.drawing, strokes }
    })
  }

  private addRuler(a: Vec, b: Vec): void {
    const ruler: Ruler = { a, b, color: store.settings.rulerColor }
    store.change(() => {
      store.rulers = [...store.rulers, ruler]
    })
    if (!store.settings.showRulers) store.set({ showRulers: true })
  }

  private fillAt(p: Vec): void {
    const { fillColor, mirrorX, mirrorY } = store.settings
    // 透明な線は文字の一部ではないので、囲いにならない
    const lines = store.drawing.strokes.filter((s) => !isClear(s)).map(strokePoints)
    const targets = [p, ...mirrors(mirrorX, mirrorY).map((m) => m.map(p))]
    const added: Fill[] = []
    for (const t of targets) {
      const rings = findRegion(lines, t)
      if (rings) added.push({ rings, color: fillColor })
    }
    if (added.length === 0) {
      toast('線で囲まれた中をクリックしてください')
      return
    }
    store.change(() => {
      // 同じ区画をもう一度塗ったら色を置き換える
      const kept = store.drawing.fills.filter((f) => !added.some((a) => sameRegion(f, a, targets)))
      store.drawing = { ...store.drawing, fills: [...kept, ...added] }
    })
  }

  private startErase(p: Vec): void {
    store.begin()
    this.erasing = true
    this.erased = false
    this.lastErase = p
    this.eraseAt(p)
  }

  private eraseMove(p: Vec): void {
    const from = this.lastErase ?? p
    const dist = Math.hypot(p.x - from.x, p.y - from.y)
    const stepLen = Math.max(0.25, store.settings.eraserSize / 3)
    const n = Math.ceil(dist / stepLen)
    for (let i = 1; i <= n; i++) {
      this.eraseAt({ x: from.x + ((p.x - from.x) * i) / n, y: from.y + ((p.y - from.y) * i) / n })
    }
    this.lastErase = p
  }

  private eraserSpots(p: Vec): Vec[] {
    const { mirrorX, mirrorY } = store.settings
    return [p, ...mirrors(mirrorX, mirrorY).map((m) => m.map(p))]
  }

  private eraseAt(p: Vec): void {
    const { eraserSize, eraserMode, showRulers } = store.settings
    const r = eraserSize / 2
    const spots = this.eraserSpots(p)
    const { strokes, fills } = store.drawing
    const hitStroke = (s: Stroke) => spots.some((q) => distToPolyline(q, strokePoints(s)) <= r + s.width / 2)
    const hitFill = (f: Fill) =>
      spots.some(
        (q) =>
          pointInRings(q, f.rings) ||
          f.rings.some((ring) => ring.some((v, i) => distToSegment(q, v, ring[(i + 1) % ring.length]) <= r)),
      )
    const hitRuler = (u: Ruler) => showRulers && distToSegment(p, u.a, u.b) <= r

    const piecewise = eraserMode === 'piece'
    let nextStrokes = strokes
    if (piecewise) {
      for (const q of spots) {
        const piece = findPiece(nextStrokes, q, r)
        if (piece) nextStrokes = removePiece(nextStrokes, piece)
      }
    } else {
      nextStrokes = strokes.filter((s) => !hitStroke(s))
    }
    const linesChanged = piecewise ? nextStrokes !== strokes : nextStrokes.length !== strokes.length
    // 接点まで消すときは線だけを狙えるように、線を消した操作の間は塗りと定規に触らない
    const linesOnly = piecewise && (linesChanged || this.erased)
    const nextFills = linesOnly ? fills : fills.filter((f) => !hitFill(f))
    const nextRulers = linesOnly ? store.rulers : store.rulers.filter((u) => !hitRuler(u))
    const changed =
      linesChanged || nextFills.length !== fills.length || nextRulers.length !== store.rulers.length
    if (!changed) return
    this.erased = true
    store.drawing = { strokes: nextStrokes, fills: nextFills }
    store.rulers = nextRulers
    store.emit('drawing')
  }

  private endErase(): void {
    if (!this.erasing) return
    this.erasing = false
    this.lastErase = null
    if (!this.erased) store.discardBegin()
    store.emit('drawing')
  }

  private onMove(e: PointerEvent): void {
    const pos = this.localPos(e)
    if (e.pointerType === 'touch') return this.touchMove(e.pointerId, pos)
    this.setCursor(pos)
    if (this.pan) {
      const dx = pos.x - this.pan.x
      const dy = pos.y - this.pan.y
      if (Math.hypot(dx, dy) > 0) {
        if (this.pan.moved || Math.hypot(dx, dy) > DRAG_SLOP) {
          this.pan.moved = true
          this.panBy(dx, dy)
          this.pan.x = pos.x
          this.pan.y = pos.y
        }
      }
      return
    }
    if (this.erasing) this.eraseMove(this.cursor!)
  }

  private setCursor(pos: Vec): void {
    this.cursorScreen = pos
    this.cursor = this.toWorld(pos.x, pos.y)
    this.request()
  }

  private onUp(e: PointerEvent): void {
    const pos = this.localPos(e)
    if (e.pointerType === 'touch') return this.touchUp(e.pointerId, pos)
    if (this.pan && this.pan.id === e.pointerId) {
      if (!this.pan.moved) this.quietRightClick(pos)
      this.pan = null
      this.updateCursor()
      return
    }
    this.endErase()
    if (this.pressed && this.pending) {
      // 押したままドラッグして離した場合も線を引く
      const pt = this.snap(this.toWorld(pos.x, pos.y))
      if (pt.x !== this.pressed.x || pt.y !== this.pressed.y) this.finishLine(pt)
    }
    this.pressed = null
  }

  /** 動かさなかった右クリック。引きかけの線を止める。タッチパッドではスロットを開く。 */
  private quietRightClick(pos: Vec): void {
    if (this.pending) this.cancelLine()
    else if (store.settings.inputMode === 'touchpad') this.slot.openSticky(pos.x, pos.y)
  }

  private onCancel(e: PointerEvent): void {
    this.touches.delete(e.pointerId)
    this.pan = null
    this.press = null
    this.pinch = null
    this.endErase()
    this.request()
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const pos = this.localPos(e)
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1
    const dx = e.deltaX * unit
    const dy = e.deltaY * unit
    const mode = store.settings.inputMode
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(pos.x, pos.y, Math.exp(-dy * (mode === 'mouse' ? 0.0016 : 0.012)))
    } else if (mode === 'mouse') {
      this.slot.wheel(dy, pos.x, pos.y)
    } else {
      this.panBy(-dx, -dy)
    }
  }

  // ---- 指の操作 ----

  private touchDown(id: number, pos: Vec): void {
    this.touches.set(id, pos)
    if (this.touches.size === 1) {
      this.press = { x: pos.x, y: pos.y, cancelled: false }
      this.setCursor(pos)
      if (store.settings.tool === 'eraser') this.startErase(this.cursor!)
      return
    }
    if (this.press) this.press.cancelled = true
    this.endErase()
    this.cursor = null
    this.pinch = this.readPinch()
    this.request()
  }

  private readPinch(): { dist: number; cx: number; cy: number } {
    const [a, b] = [...this.touches.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }

  private touchMove(id: number, pos: Vec): void {
    if (!this.touches.has(id)) return
    this.touches.set(id, pos)
    if (this.touches.size >= 2 && this.pinch) {
      const next = this.readPinch()
      this.panBy(next.cx - this.pinch.cx, next.cy - this.pinch.cy)
      if (this.pinch.dist > 0) this.zoomAt(next.cx, next.cy, next.dist / this.pinch.dist)
      this.pinch = next
      return
    }
    if (!this.press || this.press.cancelled) return
    this.setCursor(pos)
    if (this.erasing) this.eraseMove(this.cursor!)
  }

  private touchUp(id: number, pos: Vec): void {
    const wasSingle = this.touches.size === 1
    this.touches.delete(id)
    if (this.touches.size < 2) this.pinch = null
    if (!wasSingle) return
    const press = this.press
    this.press = null
    this.endErase()
    this.cursor = null
    this.request()
    if (!press || press.cancelled) return
    const { tool } = store.settings
    const world = this.toWorld(pos.x, pos.y)
    if (tool === 'fill') this.fillAt(world)
    else if (tool === 'line' || tool === 'ruler') this.pickPoint(this.snap(world))
  }

  // ---- 描画 ----

  private draw(): void {
    const { ctx, s, ox, oy, dpr } = this
    if (this.w === 0) return
    const set = store.settings
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)

    const left = -BOARD * s + ox
    const top = -BOARD * s + oy
    const size = BOARD * 2 * s
    ctx.fillStyle = '#fff'
    ctx.fillRect(left, top, size, size)
    ctx.strokeStyle = '#d4d4d4'
    ctx.lineWidth = 1
    ctx.strokeRect(left - 0.5, top - 0.5, size + 1, size + 1)

    this.drawDots()
    if (set.showCenter) this.drawCenterLines()
    if (set.showBaseline) this.drawBaseline()

    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(s, s)
    paintDrawing(ctx, store.drawing)
    for (const stroke of store.drawing.strokes) if (isClear(stroke)) paintClearLine(ctx, stroke, s)
    this.drawTargetPieces()
    ctx.restore()

    if (set.showRulers) for (const r of store.rulers) this.drawRuler(r)
    this.drawRubberBand()
    this.drawCursor()
  }

  /** 接点まで消すとき、今押すと消える部分を赤く示す。 */
  private drawTargetPieces(): void {
    const { ctx, s } = this
    const { tool, eraserMode, eraserSize } = store.settings
    if (tool !== 'eraser' || eraserMode !== 'piece' || !this.cursor) return
    const { strokes } = store.drawing
    for (const q of this.eraserSpots(this.cursor)) {
      const piece = findPiece(strokes, q, eraserSize / 2)
      if (!piece) continue
      const stroke = strokes[piece.index]
      traceStroke(ctx, subStroke(stroke, piece.from, piece.to))
      ctx.strokeStyle = '#e5484d'
      ctx.lineWidth = Math.max(stroke.width, 2 / s)
      ctx.stroke()
    }
  }

  private drawDots(): void {
    const { ctx, s, ox, oy, dpr } = this
    const st = this.step
    const x0 = Math.max(-BOARD, Math.ceil((-ox / s - 1) / st) * st)
    const x1 = Math.min(BOARD, Math.floor(((this.w - ox) / s + 1) / st) * st)
    const y0 = Math.max(-BOARD, Math.ceil((-oy / s - 1) / st) * st)
    const y1 = Math.min(BOARD, Math.floor(((this.h - oy) / s + 1) / st) * st)
    const spacing = s * st
    const r = Math.max(0.7, Math.min(2.4, spacing * 0.09))
    const round = spacing >= 14
    const paint = (major: boolean) => {
      const rr = major ? r + 0.45 : r
      ctx.fillStyle = major ? '#8c8c8c' : '#bcbcbc'
      ctx.beginPath()
      for (let y = y0; y <= y1; y += st) {
        for (let x = x0; x <= x1; x += st) {
          if ((x % 10 === 0 && y % 10 === 0) !== major) continue
          const sx = Math.round((x * s + ox) * dpr) / dpr
          const sy = Math.round((y * s + oy) * dpr) / dpr
          if (round) {
            ctx.moveTo(sx + rr, sy)
            ctx.arc(sx, sy, rr, 0, Math.PI * 2)
          } else {
            ctx.rect(sx - rr, sy - rr, rr * 2, rr * 2)
          }
        }
      }
      ctx.fill()
    }
    paint(false)
    paint(true)
  }

  private drawCenterLines(): void {
    const { ctx, s, ox, oy } = this
    ctx.save()
    ctx.strokeStyle = '#6a9be0'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(ox, oy - BOARD * s)
    ctx.lineTo(ox, oy + BOARD * s)
    ctx.moveTo(ox - BOARD * s, oy)
    ctx.lineTo(ox + BOARD * s, oy)
    ctx.stroke()
    ctx.restore()
  }

  private drawBaseline(): void {
    const { ctx, s, ox, oy } = this
    const y = BASELINE_Y * s + oy
    ctx.save()
    ctx.strokeStyle = '#e0a15f'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.moveTo(ox - BOARD * s, y)
    ctx.lineTo(ox + BOARD * s, y)
    ctx.stroke()
    ctx.restore()
  }

  private drawRuler(r: Ruler, alpha = 1): void {
    const { ctx } = this
    const a = this.toScreen(r.a)
    const b = this.toScreen(r.b)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len === 0) return
    const nx = -dy / len
    const ny = dx / len
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = r.color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    for (const p of [a, b]) {
      ctx.moveTo(p.x - nx * 5, p.y - ny * 5)
      ctx.lineTo(p.x + nx * 5, p.y + ny * 5)
    }
    ctx.stroke()

    const label = formatLength(Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y))
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    ctx.font = '600 12px system-ui, sans-serif'
    let tx = mx
    let ty = my
    if (r.a.x === r.b.x) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      tx = mx + 9
    } else if (r.a.y === r.b.y) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ty = my - 8
    } else {
      const up = ny < 0 ? 1 : -1
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      tx = mx + nx * up * 14
      ty = my + ny * up * 14
    }
    ctx.lineWidth = 3
    ctx.strokeStyle = '#fff'
    ctx.lineJoin = 'round'
    ctx.strokeText(label, tx, ty)
    ctx.fillStyle = r.color
    ctx.fillText(label, tx, ty)
    ctx.restore()
  }

  private drawRubberBand(): void {
    const { ctx, s, ox, oy } = this
    if (!this.pending) return
    const set = store.settings
    const p = this.toScreen(this.pending)
    ctx.fillStyle = '#1f1f1f'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fill()
    if (!this.cursor) return
    const end = this.snap(this.cursor)
    if (end.x === this.pending.x && end.y === this.pending.y) return
    if (set.tool === 'ruler') {
      this.drawRuler({ a: this.pending, b: end, color: set.rulerColor }, 0.7)
      return
    }
    const base = this.newStroke(this.pending, end)
    const copies = [base, ...mirrors(set.mirrorX, set.mirrorY).map((m) => mirrorStroke(base, m))]
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(s, s)
    ctx.globalAlpha = 0.55
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const c of copies) {
      if (isClear(c)) {
        paintClearLine(ctx, c, s)
        continue
      }
      traceStroke(ctx, c)
      ctx.strokeStyle = c.color
      ctx.lineWidth = c.width
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawCursor(): void {
    const { ctx } = this
    if (!this.cursor || !this.cursorScreen) return
    const set = store.settings
    if (set.tool === 'eraser') {
      const r = (set.eraserSize / 2) * this.s
      ctx.save()
      ctx.strokeStyle = '#1f1f1f'
      ctx.lineWidth = 1
      ctx.fillStyle = 'rgba(255,255,255,.55)'
      ctx.beginPath()
      ctx.arc(this.cursorScreen.x, this.cursorScreen.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      return
    }
    if (set.tool === 'fill') return
    const p = this.toScreen(this.snap(this.cursor))
    ctx.save()
    ctx.strokeStyle = '#1f1f1f'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function sameRegion(f: Fill, added: Fill, targets: Vec[]): boolean {
  const close = Math.abs(Math.abs(ringArea(f.rings[0])) - Math.abs(ringArea(added.rings[0]))) < 1e-6
  return close && targets.some((t) => pointInRing(t, f.rings[0]) && pointInRing(t, added.rings[0]))
}

function formatLength(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
