import { store } from '../store'
import type { Curve, EraserMode, Tool } from '../types'
import { icons } from './dom'

export interface ToolItem {
  key: string
  label: string
  icon: string
  tool: Tool
  curve?: Curve
  eraserMode?: EraserMode
}

/** スロットとスマホ用バーに並ぶ道具。 */
export const TOOL_ITEMS: ToolItem[] = [
  { key: 'line', label: '直線', icon: icons.line, tool: 'line', curve: 'straight' },
  { key: 'left', label: '左に曲げる', icon: icons.curveLeft, tool: 'line', curve: 'left' },
  { key: 'right', label: '右に曲げる', icon: icons.curveRight, tool: 'line', curve: 'right' },
  { key: 'fill', label: '塗りつぶし', icon: icons.fill, tool: 'fill' },
  { key: 'eraser', label: '消しゴム(線ごと)', icon: icons.eraser, tool: 'eraser', eraserMode: 'whole' },
  { key: 'eraserPiece', label: '消しゴム(接点まで)', icon: icons.eraserPiece, tool: 'eraser', eraserMode: 'piece' },
  { key: 'ruler', label: '定規', icon: icons.ruler, tool: 'ruler' },
]

export function currentItemIndex(): number {
  const { tool, curve, eraserMode } = store.settings
  return TOOL_ITEMS.findIndex(
    (i) => i.tool === tool && (!i.curve || i.curve === curve) && (!i.eraserMode || i.eraserMode === eraserMode),
  )
}

export function selectItem(item: ToolItem): void {
  const { tool, curve, eraserMode } = item
  store.set({ tool, ...(curve && { curve }), ...(eraserMode && { eraserMode }) })
}
