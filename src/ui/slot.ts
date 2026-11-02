import { store } from '../store'
import { h, icons } from './dom'
import { TOOL_ITEMS, currentItemIndex, selectItem } from './tools'

const HIDE_AFTER = 1500

/** カーソルのそばに出る、道具切り替え用の縦長スロット。 */
export class Slot {
  readonly el: HTMLElement
  private buttons: HTMLButtonElement[]
  private timer = 0
  private acc = 0
  private hovering = false

  constructor(private stage: HTMLElement) {
    this.buttons = TOOL_ITEMS.map((item) =>
      h(
        'button',
        {
          class: 'slot-item',
          title: item.label,
          'aria-label': item.label,
          html: item.icon,
          onclick: () => {
            selectItem(item)
            this.hide()
          },
        },
      ),
    )
    this.el = h('div', { class: 'slot', role: 'toolbar', 'aria-label': '道具の切り替え' }, ...this.buttons)
    this.el.addEventListener('pointerenter', () => {
      this.hovering = true
      clearTimeout(this.timer)
    })
    this.el.addEventListener('pointerleave', () => {
      this.hovering = false
      this.scheduleHide()
    })
    stage.append(this.el)
    store.on('settings', () => this.sync())
    this.sync()
  }

  private sync(): void {
    const index = currentItemIndex()
    this.buttons.forEach((b, i) => b.classList.toggle('active', i === index))
  }

  get visible(): boolean {
    return this.el.classList.contains('show')
  }

  /** カーソルの右に、入らなければ左に出す。 */
  show(x: number, y: number): void {
    const { offsetWidth: w, offsetHeight: h } = this.el
    const gap = 26
    const stageW = this.stage.clientWidth
    const stageH = this.stage.clientHeight
    const left = x + gap + w + 8 > stageW ? x - gap - w : x + gap
    const top = Math.max(8, Math.min(y - h / 2, stageH - h - 8))
    this.el.style.left = `${Math.max(8, left)}px`
    this.el.style.top = `${top}px`
    this.el.classList.add('show')
  }

  hide(): void {
    clearTimeout(this.timer)
    this.acc = 0
    this.el.classList.remove('show')
  }

  private scheduleHide(): void {
    clearTimeout(this.timer)
    if (!this.hovering) this.timer = window.setTimeout(() => this.hide(), HIDE_AFTER)
  }

  /** マウスホイールの回転を受け取る。1段ごとに道具が1つ進む。 */
  wheel(deltaY: number, x: number, y: number): void {
    if (!this.visible) this.show(x, y)
    this.scheduleHide()
    this.acc += deltaY
    if (Math.abs(this.acc) < 40) return
    const dir = Math.sign(this.acc)
    this.acc = 0
    const n = TOOL_ITEMS.length
    selectItem(TOOL_ITEMS[(currentItemIndex() + dir + n) % n])
  }

  /** タッチパッドの二本指タップ用。選ぶまで閉じない。 */
  openSticky(x: number, y: number): void {
    clearTimeout(this.timer)
    this.show(x, y)
  }
}

/** スマホ操作のときに下へ常に出す道具バー。 */
export function buildTouchBar(onUndo: () => void): HTMLElement {
  const buttons = TOOL_ITEMS.map((item) =>
    h('button', {
      class: 'touchbar-item',
      'aria-label': item.label,
      title: item.label,
      html: item.icon,
      onclick: () => selectItem(item),
    }),
  )
  const sync = () => {
    const index = currentItemIndex()
    buttons.forEach((b, i) => b.classList.toggle('active', i === index))
    bar.classList.toggle('show', store.settings.inputMode === 'touch')
  }
  const undo = h('button', {
    class: 'touchbar-item',
    'aria-label': '元に戻す',
    title: '元に戻す',
    html: icons.undo,
    onclick: onUndo,
  })
  const bar = h('div', { class: 'touchbar' }, ...buttons, undo)
  store.on('settings', sync)
  sync()
  return bar
}
