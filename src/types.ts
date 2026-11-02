export interface Vec {
  x: number
  y: number
}

export type Tool = 'line' | 'fill' | 'eraser' | 'ruler'
export type Curve = 'straight' | 'left' | 'right'
export type InputMode = 'mouse' | 'touchpad' | 'touch'
/** whole は引いた線ごと、piece は接点から接点までを消す。 */
export type EraserMode = 'whole' | 'piece'

/** 2点を結ぶ線。sweep は円弧の開き角度(度)で、0 が直線、正が進行方向の左、負が右に曲がる。 */
export interface Stroke {
  a: Vec
  b: Vec
  sweep: number
  width: number
  color: string
}

/** 塗りつぶし。rings[0] が外周で、それ以外は穴。 */
export interface Fill {
  rings: Vec[][]
  color: string
}

export interface Ruler {
  a: Vec
  b: Vec
  color: string
}

export interface Drawing {
  strokes: Stroke[]
  fills: Fill[]
}

export interface Settings {
  tool: Tool
  curve: Curve
  sweep: number
  width: number
  eraserSize: number
  eraserMode: EraserMode
  clearLine: boolean
  lineColor: string
  fillColor: string
  rulerColor: string
  showRulers: boolean
  showCenter: boolean
  showBaseline: boolean
  mirrorX: boolean
  mirrorY: boolean
  chain: boolean
  inputMode: InputMode
  /** フォントを、全文字を合わせた範囲が1文字の枠に収まる大きさで書き出す。 */
  fontFit: boolean
}
