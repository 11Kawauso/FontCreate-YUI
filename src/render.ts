import { drawingBounds, isClear, strokePoints } from './geometry'
import type { Drawing, Stroke } from './types'

export function traceStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  const pts = strokePoints(s)
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
}

/** 座標変換済みの ctx に、塗りと線を描く。 */
export function paintDrawing(ctx: CanvasRenderingContext2D, d: Drawing): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const f of d.fills) {
    ctx.beginPath()
    for (const ring of f.rings) {
      ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
    }
    ctx.fillStyle = f.color
    ctx.fill('evenodd')
  }
  for (const s of d.strokes) {
    if (isClear(s)) continue
    traceStroke(ctx, s)
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.stroke()
  }
}

/** 透明な線の目印。制作エリアにだけ出し、プレビューやPNGには写らない。 */
export function paintClearLine(ctx: CanvasRenderingContext2D, s: Stroke, scale: number): void {
  traceStroke(ctx, s)
  ctx.strokeStyle = 'rgba(70, 120, 200, 0.2)'
  ctx.lineWidth = s.width
  ctx.stroke()
  ctx.strokeStyle = '#4678c8'
  ctx.lineWidth = 1 / scale
  ctx.setLineDash([5 / scale, 4 / scale])
  ctx.stroke()
  ctx.setLineDash([])
}

/** 描いたものが size 四方にぴったり収まるように描く。透明な線も範囲に含める。 */
export function paintFitted(ctx: CanvasRenderingContext2D, d: Drawing, size: number): void {
  const b = drawingBounds(d)
  if (!b) return
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const pad = size * 0.03
  const scale = (size - pad * 2) / Math.max(w, h, 0.001)
  ctx.save()
  ctx.translate(size / 2 - ((b.minX + b.maxX) / 2) * scale, size / 2 - ((b.minY + b.maxY) / 2) * scale)
  ctx.scale(scale, scale)
  paintDrawing(ctx, d)
  ctx.restore()
}

/** キャンバスを、高解像度の画面でもにじまないサイズに整える。 */
export function fitCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): number {
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(cssW * dpr)
  const h = Math.round(cssH * dpr)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  return dpr
}
