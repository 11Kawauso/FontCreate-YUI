import { Editor } from './editor'
import { loadSession, startAutosave } from './storage'
import { store } from './store'
import './style.css'
import { h, icons } from './ui/dom'
import { closePopover } from './ui/feedback'
import { buildLeft } from './ui/left'
import { buildModeButton } from './ui/modeButton'
import { buildRight, saveCurrent } from './ui/right'
import { Slot, buildTouchBar } from './ui/slot'
import { TOOL_ITEMS, selectItem } from './ui/tools'

async function start(): Promise<void> {
  await loadSession()

  const left = h('aside', { class: 'side left', 'aria-label': '道具と線の設定' })
  const right = h('aside', { class: 'side right', 'aria-label': '保存と文字の一覧' })
  const stage = h('main', { class: 'stage' }, h('canvas', { class: 'board', 'aria-label': '制作エリア' }))
  const scrim = h('div', { class: 'scrim', onclick: () => setDrawer(null) })
  const app = document.querySelector<HTMLElement>('#app')!
  app.className = 'app'
  app.append(left, stage, right, scrim)

  const setDrawer = (side: 'left' | 'right' | null) => {
    left.classList.toggle('open', side === 'left')
    right.classList.toggle('open', side === 'right')
    scrim.classList.toggle('show', side !== null)
    closePopover()
  }

  const slot = new Slot(stage)
  const editor = new Editor(stage, slot)
  buildLeft(left, () => editor.fitView())
  buildRight(right)
  stage.append(
    h('button', { class: 'drawer-btn drawer-left', type: 'button', html: icons.menu, 'aria-label': '道具を開く', onclick: () => setDrawer('left') }),
    h('button', { class: 'drawer-btn drawer-right', type: 'button', html: icons.grid, 'aria-label': '文字の表を開く', onclick: () => setDrawer('right') }),
    buildTouchBar(() => store.undo()),
    buildModeButton(),
  )

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    if (target.matches('input[type=text], textarea')) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (mod && key === 'z') {
      e.preventDefault()
      if (e.shiftKey) store.redo()
      else store.undo()
    } else if (mod && key === 'y') {
      e.preventDefault()
      store.redo()
    } else if (mod && key === 's') {
      e.preventDefault()
      saveCurrent()
    } else if (key === 'escape') {
      editor.cancelLine()
      slot.hide()
    } else if (!mod && /^[1-9]$/.test(key) && TOOL_ITEMS[Number(key) - 1]) {
      selectItem(TOOL_ITEMS[Number(key) - 1])
    }
  })

  startAutosave()
  store.emit('drawing')
}

start()
