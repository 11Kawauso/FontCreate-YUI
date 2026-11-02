import { get, set } from 'idb-keyval'
import { store } from './store'

const KEY = 'fontcreate-yui'

/** 前回の内容をブラウザから読み出す。 */
export async function loadSession(): Promise<void> {
  try {
    const data = await get(KEY)
    if (data) store.hydrate(data)
  } catch {
    // 読めない環境では白紙から始める
  }
}

/** 変更があるたびに、少し待ってからブラウザへ自動保存する。 */
export function startAutosave(): void {
  let timer = 0
  const write = () => {
    set(KEY, {
      settings: store.settings,
      drawing: store.drawing,
      rulers: store.rulers,
      glyphs: store.glyphs,
      activeChar: store.activeChar,
      fontName: store.fontName,
    }).catch(() => {})
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = window.setTimeout(write, 400)
  }
  for (const topic of ['settings', 'drawing', 'glyphs', 'active'] as const) store.on(topic, schedule)
}
