import { isEmpty } from '../geometry'
import { store } from '../store'
import type { Curve, EraserMode, Settings, Tool } from '../types'
import { h, icons } from './dom'
import { ask, helpMark } from './feedback'
import { scrollArea } from './scrollbar'

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]
type ColorKey = 'lineColor' | 'fillColor' | 'rulerColor'
type NumberKey = 'width' | 'sweep' | 'eraserSize'

const TOOLS: { tool: Tool; label: string; icon: string }[] = [
  { tool: 'line', label: '線', icon: icons.line },
  { tool: 'fill', label: '塗りつぶし', icon: icons.fill },
  { tool: 'eraser', label: '消しゴム', icon: icons.eraser },
  { tool: 'ruler', label: '定規', icon: icons.ruler },
]

const CURVES: { curve: Curve; label: string; icon: string }[] = [
  { curve: 'straight', label: '直線', icon: icons.line },
  { curve: 'left', label: '左に曲げる', icon: icons.curveLeft },
  { curve: 'right', label: '右に曲げる', icon: icons.curveRight },
]

const ERASER_MODES: { mode: EraserMode; label: string }[] = [
  { mode: 'whole', label: '線ごと' },
  { mode: 'piece', label: '接点まで' },
]

function section(title: string, help: string | null, ...kids: Node[]): HTMLElement {
  return h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel-title' }, title, help ? helpMark(help, `${title}のヘルプ`) : null),
    ...kids,
  )
}

function slider(label: string, key: NumberKey, min: number, max: number, step: number, unit: string): HTMLElement {
  const value = h('span', { class: 'field-value' })
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    'aria-label': label,
    oninput: () => store.set({ [key]: Number(input.value) }),
  })
  const sync = () => {
    input.value = String(store.settings[key])
    value.textContent = `${store.settings[key]}${unit}`
    input.style.setProperty('--pos', `${((store.settings[key] - min) / (max - min)) * 100}%`)
  }
  store.on('settings', sync)
  sync()
  return h('label', { class: 'field' }, h('span', { class: 'field-head' }, label, value), input)
}

function toggle(label: string, key: BoolKey, help?: string): HTMLElement {
  const id = `option-${key}`
  const input = h('input', {
    id,
    type: 'checkbox',
    class: 'switch-input',
    onchange: () => store.set({ [key]: input.checked }),
  })
  const sync = () => {
    input.checked = store.settings[key]
  }
  store.on('settings', sync)
  sync()
  return h(
    'div',
    { class: 'toggle-row' },
    h('label', { class: 'toggle-label', for: id }, label),
    help ? helpMark(help, `${label}のヘルプ`) : null,
    h('label', { class: 'toggle' }, input, h('span', { class: 'switch' })),
  )
}

function colorField(label: string, key: ColorKey): HTMLElement {
  const input = h('input', {
    type: 'color',
    'aria-label': `${label}の色`,
    oninput: () => store.set({ [key]: input.value }),
  })
  const sync = () => {
    input.value = store.settings[key]
  }
  store.on('settings', sync)
  sync()
  return h('label', { class: 'swatch' }, input, h('span', null, label))
}

export function buildLeft(root: HTMLElement, onFit: () => void): void {
  const toolButtons = TOOLS.map((t) =>
    h(
      'button',
      {
        class: 'tool-btn',
        type: 'button',
        onclick: () => store.set({ tool: t.tool }),
      },
      h('span', { class: 'tool-icon', html: t.icon }),
      h('span', null, t.label),
    ),
  )
  const curveButtons = CURVES.map((c) =>
    h('button', {
      class: 'seg-btn',
      type: 'button',
      title: c.label,
      'aria-label': c.label,
      html: c.icon,
      onclick: () => store.set({ curve: c.curve }),
    }),
  )
  const eraserButtons = ERASER_MODES.map((m) =>
    h(
      'button',
      {
        class: 'seg-btn seg-text',
        type: 'button',
        onclick: () => store.set({ eraserMode: m.mode }),
      },
      m.label,
    ),
  )
  const eraserModeField = h(
    'div',
    { class: 'field' },
    h(
      'div',
      { class: 'field-head' },
      '消し方',
      helpMark(
        '「線ごと」は、触れた線を1本まるごと消します。「接点まで」は、触れた線のうち、ほかの線と交わる点やつながる点から次の点までを消します。はみ出した部分だけを消したいときに使います。消える部分は押す前に赤く表示されます。線が近くにないときは、塗りや定規を消します。',
        '消し方のヘルプ',
      ),
    ),
    h('div', { class: 'seg seg-two' }, ...eraserButtons),
  )
  const sweepField = slider('曲がり具合', 'sweep', 15, 180, 15, '°')
  const eraserField = slider('消しゴムの大きさ', 'eraserSize', 1, 20, 1, 'マス')
  const lineSwatch = colorField('線', 'lineColor')

  const undoBtn = h('button', { class: 'btn icon-btn', type: 'button', onclick: () => store.undo() })
  undoBtn.innerHTML = `${icons.undo}<span>元に戻す</span>`
  const redoBtn = h('button', { class: 'btn icon-btn', type: 'button', onclick: () => store.redo() })
  redoBtn.innerHTML = `${icons.redo}<span>やり直す</span>`
  const clearBtn = h(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: async () => {
        const ok = await ask(
          '全部消しますか？',
          '制作エリアの線と塗りつぶしをすべて消します。「元に戻す」で戻せます。',
          [
            { label: 'やめる', value: false },
            { label: '全部消す', value: true, danger: true },
          ],
          false,
        )
        if (ok) store.change(() => (store.drawing = { strokes: [], fills: [] }))
      },
    },
    '全部消す',
  )

  const sync = () => {
    const { tool, curve, eraserMode, clearLine } = store.settings
    toolButtons.forEach((b, i) => b.classList.toggle('active', TOOLS[i].tool === tool))
    curveButtons.forEach((b, i) => b.classList.toggle('active', CURVES[i].curve === curve))
    eraserButtons.forEach((b, i) => b.classList.toggle('active', ERASER_MODES[i].mode === eraserMode))
    sweepField.classList.toggle('dim', curve === 'straight')
    eraserField.classList.toggle('hidden', tool !== 'eraser')
    eraserModeField.classList.toggle('hidden', tool !== 'eraser')
    lineSwatch.classList.toggle('dim', clearLine)
  }
  const syncHistory = () => {
    undoBtn.disabled = !store.canUndo
    redoBtn.disabled = !store.canRedo
    clearBtn.disabled = isEmpty(store.drawing)
  }
  store.on('settings', sync)
  store.on('drawing', syncHistory)
  store.on('active', syncHistory)
  sync()
  syncHistory()

  const { host, body } = scrollArea('left-scroll')
  body.append(
    section('道具', null, h('div', { class: 'tool-grid' }, ...toolButtons), eraserModeField, eraserField),
    section(
      '線の形',
      '「左に曲げる」「右に曲げる」は、線を引く向きから見て左右どちらに膨らませるかを決めます。曲がり具合は円の何度分かを表します。90°で引いた線を4本つなぐと、きれいな円になります。',
      h('div', { class: 'seg' }, ...curveButtons),
      sweepField,
      slider('線の太さ', 'width', 0.5, 20, 0.5, 'マス'),
    ),
    section(
      '色',
      null,
      h('div', { class: 'swatches' }, lineSwatch, colorField('塗り', 'fillColor'), colorField('定規', 'rulerColor')),
      toggle(
        '透明な線',
        'clearLine',
        'オンの間は、見えない線を引きます。制作エリアでは青い点線で表示されますが、PNGやフォントには写りません。プレビューとPNGは、この線まで含めた範囲で大きさが決まるので、文字の周りに余白を作れます。英数字と半角記号は、フォントの文字幅もこの線まで広がります。塗りつぶしの囲いにはなりません。',
      ),
    ),
    section(
      '表示',
      null,
      toggle('定規', 'showRulers', '定規はすべての文字で共通です。文字をまたいで高さや幅をそろえる目安に使えます。PNGやフォントには含まれません。'),
      toggle('中心線', 'showCenter'),
      toggle('基準線', 'showBaseline', 'オレンジの点線が基準線です。フォントにしたとき、文字の足元がこの高さでそろいます。gやyのように下へはみ出す部分は、線より下に描きます。'),
      h('button', { class: 'btn wide', type: 'button', onclick: onFit }, '全体を表示'),
    ),
    section(
      '対称にする',
      'オンにすると、中心線を境に反対側へも同じ線・塗りつぶし・消しゴムが効きます。定規は対称になりません。',
      toggle('左右対称', 'mirrorX'),
      toggle('上下対称', 'mirrorY'),
    ),
    section(
      '線の引き方',
      null,
      toggle('続けて線を引く', 'chain', 'オンだと、引き終わった点からそのまま次の線を引けます。同じ点をもう一度押すか、右クリック、Escキーで止まります。始点に戻ると自動で止まります。オフだと1本ごとに止まります。'),
    ),
    section('編集', null, h('div', { class: 'btn-row' }, undoBtn, redoBtn), h('div', { class: 'btn-row' }, clearBtn)),
  )

  root.append(h('header', { class: 'brand' }, h('h1', null, 'フォントクリエイト・結')), host)
}
