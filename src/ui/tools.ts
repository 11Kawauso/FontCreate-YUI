import { store } from '../store'
import type { Curve, Tool } from '../types'
import { icons } from './dom'

export interface ToolItem {
  key: string
  label: string
  icon: string
  tool: Tool
  curve?: Curve
}

/** スロットとスマホ用バーに並ぶ道具。 */
export const TOOL_ITEMS: ToolItem[] = [
  { key: 'line', label: '直線', icon: icons.line, tool: 'line', curve: 'straight' },
  { key: 'left', label: '左に曲げる', icon: icons.curveLeft, tool: 'line', curve: 'left' },
  { key: 'right', label: '右に曲げる', icon: icons.curveRight, tool: 'line', curve: 'right' },
  { key: 'fill', label: '塗りつぶし', icon: icons.fill, tool: 'fill' },
  { key: 'eraser', label: '消しゴム', icon: icons.eraser, tool: 'eraser' },
  { key: 'ruler', label: '定規', icon: icons.ruler, tool: 'ruler' },
]

export function currentItemIndex(): number {
  const { tool, curve } = store.settings
  return TOOL_ITEMS.findIndex((i) => i.tool === tool && (!i.curve || i.curve === curve))
}

export function selectItem(item: ToolItem): void {
  store.set(item.curve ? { tool: item.tool, curve: item.curve } : { tool: item.tool })
}
