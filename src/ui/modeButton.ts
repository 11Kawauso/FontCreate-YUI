import { store } from '../store'
import type { InputMode } from '../types'
import { h, icons } from './dom'
import { closePopover, openPopover, toast } from './feedback'

const MODES: { mode: InputMode; label: string; icon: string; help: string[] }[] = [
  {
    mode: 'mouse',
    label: 'マウス',
    icon: icons.mouse,
    help: ['左クリック：点を選ぶ', '右ドラッグ：画面を動かす', 'Ctrl+ホイール：拡大・縮小', 'ホイール：道具の切り替え'],
  },
  {
    mode: 'touchpad',
    label: 'タッチパッド',
    icon: icons.touchpad,
    help: ['クリック：点を選ぶ', '二本指でなぞる：画面を動かす', 'ピンチ：拡大・縮小', '二本指タップ：道具の切り替え'],
  },
  {
    mode: 'touch',
    label: '指（スマホ）',
    icon: icons.touch,
    help: ['タップ：点を選ぶ', '二本指でなぞる：画面を動かす', 'ピンチ：拡大・縮小', '下のバー：道具の切り替え'],
  },
]

/** 制作エリア右下の、操作方法を切り替える四角いボタン。 */
export function buildModeButton(): HTMLElement {
  const menu = () =>
    h(
      'div',
      { class: 'mode-menu' },
      ...MODES.map((m) => {
        const btn = h(
          'button',
          {
            class: `mode-option${store.settings.inputMode === m.mode ? ' active' : ''}`,
            type: 'button',
            onclick: () => {
              store.set({ inputMode: m.mode })
              closePopover()
              toast(`${m.label}の操作に切り替えました`)
            },
          },
          h('span', { class: 'mode-icon', html: m.icon }),
          h('span', { class: 'mode-text' }, h('b', null, m.label), ...m.help.map((t) => h('small', null, t))),
        )
        return btn
      }),
    )

  const button = h('button', {
    class: 'mode-btn',
    type: 'button',
    title: '操作方法の切り替え',
    'aria-label': '操作方法の切り替え',
    onclick: () => openPopover(button, menu(), 'mode-pop'),
  })
  const sync = () => {
    button.innerHTML = MODES.find((m) => m.mode === store.settings.inputMode)!.icon
  }
  store.on('settings', sync)
  sync()
  return button
}
