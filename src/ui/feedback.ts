import { h } from './dom'

let toastEl: HTMLElement | null = null
let toastTimer = 0

export function toast(message: string): void {
  toastEl ??= document.body.appendChild(h('div', { class: 'toast', role: 'status' }))
  toastEl.textContent = message
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl!.classList.remove('show'), 2400)
}

export interface DialogButton<T> {
  label: string
  value: T
  primary?: boolean
  danger?: boolean
}

/** 画面中央の確認ウィンドウ。押されたボタンの value を返す。 */
export function ask<T>(title: string, message: string, buttons: DialogButton<T>[], dismiss: T): Promise<T> {
  return new Promise((resolve) => {
    const close = (value: T) => {
      overlay.remove()
      document.removeEventListener('keydown', onKey, true)
      resolve(value)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close(dismiss)
    }
    const overlay = h(
      'div',
      { class: 'dialog-overlay', onpointerdown: (e: Event) => e.target === overlay && close(dismiss) },
      h(
        'div',
        { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('h2', null, title),
        h('p', null, message),
        h(
          'div',
          { class: 'dialog-actions' },
          ...buttons.map((b) =>
            h(
              'button',
              { class: `btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}`, onclick: () => close(b.value) },
              b.label,
            ),
          ),
        ),
      ),
    )
    document.body.append(overlay)
    document.addEventListener('keydown', onKey, true)
  })
}

let popEl: HTMLElement | null = null
let popAnchor: Element | null = null

export function closePopover(): void {
  popEl?.remove()
  popEl = null
  popAnchor = null
}

/** 要素のそばに小さな箱を出す。はみ出すときは反対側に出す。 */
export function openPopover(anchor: Element, content: HTMLElement, className = ''): void {
  const same = popAnchor === anchor
  closePopover()
  if (same) return
  popAnchor = anchor
  popEl = h('div', { class: `popover ${className}` }, content)
  document.body.append(popEl)
  const a = anchor.getBoundingClientRect()
  const p = popEl.getBoundingClientRect()
  const margin = 8
  let left = a.left + a.width / 2 - p.width / 2
  let top = a.bottom + 6
  if (top + p.height > innerHeight - margin) top = a.top - p.height - 6
  left = Math.max(margin, Math.min(left, innerWidth - p.width - margin))
  top = Math.max(margin, top)
  popEl.style.left = `${left}px`
  popEl.style.top = `${top}px`
}

document.addEventListener('pointerdown', (e) => {
  const target = e.target as Node
  if (popEl && !popEl.contains(target) && !popAnchor?.contains(target)) closePopover()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopover()
})

/** 丸の中に「?」のヘルプマーク。押すと説明が開く。 */
export function helpMark(text: string, label = 'ヘルプ'): HTMLElement {
  const btn: HTMLButtonElement = h(
    'button',
    {
      class: 'help',
      type: 'button',
      'aria-label': label,
      onclick: (e: Event) => {
        e.stopPropagation()
        openPopover(btn, h('div', { class: 'help-text' }, text), 'help-pop')
      },
    },
    '?',
  )
  return btn
}
