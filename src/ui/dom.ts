type Kid = Node | string | null | undefined | false

/** 要素を作る小さな道具。on〇〇 はイベント、html は中身のHTML、それ以外は属性。 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown> | null,
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'html') el.innerHTML = String(value)
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value as EventListener)
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  for (const kid of kids) if (kid || kid === '') el.append(kid)
  return el
}

const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="1.7" fill="currentColor" stroke="none"/>`

export const icons = {
  line: icon(`<path d="M6 18 18 6"/>${dot(6, 18)}${dot(18, 6)}`),
  curveLeft: icon(`<path d="M15 20C5 16 5 8 15 4"/>${dot(15, 20)}${dot(15, 4)}`),
  curveRight: icon(`<path d="M9 20C19 16 19 8 9 4"/>${dot(9, 20)}${dot(9, 4)}`),
  fill: icon('<path d="M12 3.5S5.5 10.8 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10.8 12 3.5 12 3.5Z" fill="currentColor"/>'),
  eraser: icon('<path d="M8.5 20H20M4.6 14.4l8.6-8.6a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19.5a2 2 0 0 1-1.4.5H8.8a2 2 0 0 1-1.4-.6l-2.8-2.8a1.6 1.6 0 0 1 0-2.2ZM9.2 9.8l5 5"/>'),
  eraserPiece: icon(`<path d="M5 20.5h14"/>${dot(4, 20.5)}${dot(20, 20.5)}<path d="m6.3 11.6 6.4-6.4a1.6 1.6 0 0 1 2.2 0l2.6 2.6a1.6 1.6 0 0 1 0 2.2l-5.3 5.3a1.6 1.6 0 0 1-1.1.5H9a1.6 1.6 0 0 1-1.1-.5l-1.6-1.6a1.6 1.6 0 0 1 0-2.1ZM9.8 8.1l4 4"/>`),
  ruler: icon('<path d="M3.5 16.5 16.5 3.5l4 4-13 13ZM7.5 12.5l2 2M10.5 9.5l2.6 2.6M13.5 6.5l2 2"/>'),
  mouse: icon('<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 7v3.5"/>'),
  touchpad: icon('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M12 14.5v5"/>'),
  touch: icon('<path d="M9 11.5V5.2a1.6 1.6 0 0 1 3.2 0V11l4.6 1a2 2 0 0 1 1.6 2.3L17.4 20H10l-4.2-5.2a1.5 1.5 0 0 1 2.2-2Z"/>'),
  undo: icon('<path d="M8 6 4 10l4 4M4 10h10a5 5 0 0 1 0 10h-3"/>'),
  redo: icon('<path d="m16 6 4 4-4 4M20 10H10a5 5 0 0 0 0 10h3"/>'),
  menu: icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  grid: icon('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
}
