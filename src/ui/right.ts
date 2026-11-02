import { CHAR_SETS, allChars } from '../charset'
import { exportFont, exportPng, exportProject, exportZip, parseProject } from '../exporter'
import { fitCanvas, paintFitted } from '../render'
import { store } from '../store'
import { h } from './dom'
import { ask, closePopover, helpMark, openPopover, toast } from './feedback'
import { scrollArea } from './scrollbar'

const PREVIEW_SIZE = 180
const THUMB_SIZE = 44
const FONT_SIZES = [
  { fit: true, label: 'プレビューどおり' },
  { fit: false, label: '制作エリアどおり' },
]

/** 保存していない絵が消えないように確認する。続けてよければ true。 */
async function confirmDiscard(): Promise<boolean> {
  if (!store.dirty || store.empty) return true
  const char = store.activeChar
  const answer = await ask<'save' | 'discard' | 'cancel'>(
    '保存していない絵があります',
    char ? `「${char}」の変更はまだ保存されていません。` : '今の絵はまだ表に保存されていません。',
    [
      { label: 'やめる', value: 'cancel' },
      { label: '保存しない', value: 'discard', danger: true },
      ...(char ? [{ label: '保存する', value: 'save' as const, primary: true }] : []),
    ],
    'cancel',
  )
  if (answer === 'save') store.saveTo(char!)
  return answer !== 'cancel'
}

async function saveInto(char: string): Promise<void> {
  if (store.glyphs[char] && store.activeChar !== char) {
    const ok = await ask(
      '上書きしますか？',
      `「${char}」にはすでに文字が保存されています。今の絵で置き換えます。`,
      [
        { label: 'やめる', value: false },
        { label: '上書きする', value: true, primary: true },
      ],
      false,
    )
    if (!ok) return
  }
  store.saveTo(char)
  toast(`「${char}」に保存しました`)
}

export function saveCurrent(): void {
  if (store.activeChar) saveInto(store.activeChar)
  else toast('下の表から保存先の文字を押してください')
}

function cellMenu(char: string): HTMLElement {
  const saved = !!store.glyphs[char]
  const act = (fn: () => void | Promise<void>) => () => {
    closePopover()
    fn()
  }
  return h(
    'div',
    { class: 'cell-menu' },
    h('div', { class: 'cell-menu-head' }, h('b', null, char), h('span', null, saved ? '保存済み' : '未保存')),
    h(
      'button',
      { class: 'menu-btn', type: 'button', disabled: store.empty, onclick: act(() => saveInto(char)) },
      saved ? '今の絵で上書き保存' : '今の絵をここに保存',
    ),
    h(
      'button',
      {
        class: 'menu-btn',
        type: 'button',
        disabled: store.activeChar === char,
        onclick: act(async () => {
          if (await confirmDiscard()) store.open(char)
        }),
      },
      saved ? 'この文字を開く' : '白紙でこの文字を描く',
    ),
    saved
      ? h(
          'button',
          {
            class: 'menu-btn danger',
            type: 'button',
            onclick: act(async () => {
              const ok = await ask(
                '表から消しますか？',
                `「${char}」の保存内容を消します。元に戻せません。`,
                [
                  { label: 'やめる', value: false },
                  { label: '消す', value: true, danger: true },
                ],
                false,
              )
              if (ok) store.removeGlyph(char)
            }),
          },
          '表から消す',
        )
      : null,
  )
}

function buildTables(): { root: HTMLElement; refresh: () => void } {
  const cells = new Map<string, HTMLButtonElement>()
  const thumbs = new Map<string, string>()
  const counts: { set: (typeof CHAR_SETS)[number]; el: HTMLElement }[] = []

  const makeCell = (char: string) => {
    const cell = h(
      'button',
      {
        class: 'cell',
        type: 'button',
        'aria-label': char,
        onclick: () => openPopover(cell, cellMenu(char), 'cell-pop'),
      },
      h('span', { class: 'cell-char' }, char),
    )
    cells.set(char, cell)
    return cell
  }

  const root = h(
    'div',
    { class: 'tables' },
    ...CHAR_SETS.map((set) => {
      const count = h('span', { class: 'count' })
      counts.push({ set, el: count })
      return h(
        'details',
        { class: 'table', open: true },
        h('summary', null, h('span', { class: 'chev' }), set.title, count),
        ...set.groups.flatMap((g) => [
          g.label ? h('h3', { class: 'group-label' }, g.label) : null,
          h(
            'div',
            { class: 'char-grid', style: `--cols:${g.cols}` },
            ...g.chars.map((c) => (c ? makeCell(c) : h('span', { class: 'cell blank' }))),
          ),
        ]),
      )
    }),
  )

  const paintThumb = (char: string, cell: HTMLElement) => {
    const glyph = store.glyphs[char]
    const json = glyph ? JSON.stringify(glyph) : ''
    if (thumbs.get(char) === json) return
    thumbs.set(char, json)
    cell.querySelector('canvas')?.remove()
    cell.classList.toggle('saved', !!glyph)
    if (!glyph) return
    const canvas = h('canvas', { class: 'cell-thumb' })
    const dpr = fitCanvas(canvas, THUMB_SIZE, THUMB_SIZE)
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    paintFitted(ctx, glyph, THUMB_SIZE)
    cell.append(canvas)
  }

  const refresh = () => {
    for (const [char, cell] of cells) {
      paintThumb(char, cell)
      cell.classList.toggle('active', char === store.activeChar)
    }
    for (const { set, el } of counts) {
      const chars = set.groups.flatMap((g) => g.chars.filter(Boolean))
      el.textContent = `${chars.filter((c) => store.glyphs[c]).length} / ${chars.length}`
    }
  }
  return { root, refresh }
}

export function buildRight(root: HTMLElement): void {
  // プレビュー
  const preview = h('canvas', { class: 'preview-canvas', 'aria-label': 'プレビュー' })
  const placeholder = h('span', { class: 'preview-empty' }, 'プレビュー')
  const dpr = fitCanvas(preview, PREVIEW_SIZE, PREVIEW_SIZE)
  const pctx = preview.getContext('2d')!
  const paintPreview = () => {
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    pctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
    paintFitted(pctx, store.drawing, PREVIEW_SIZE)
    placeholder.hidden = !store.empty
  }

  // 文字の状態
  const charBox = h('div', { class: 'status-char' })
  const stateText = h('div', { class: 'status-state' })
  const totalText = h('div', { class: 'status-total' })
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: saveCurrent }, '保存')
  const pngBtn = h('button', { class: 'btn', type: 'button', onclick: () => exportPng() }, 'PNG書き出し')
  const newBtn = h(
    'button',
    {
      class: 'btn wide',
      type: 'button',
      onclick: async () => {
        if (await confirmDiscard()) store.open(null)
      },
    },
    '新しく描く',
  )

  const syncStatus = () => {
    const char = store.activeChar
    charBox.textContent = char ?? '—'
    charBox.classList.toggle('none', !char)
    const dirty = store.dirty
    stateText.className = `status-state ${dirty && !store.empty ? 'warn' : ''}`
    if (!char) stateText.textContent = store.empty ? '白紙' : '表に未保存'
    else if (dirty) stateText.textContent = '変更あり（未保存）'
    else stateText.textContent = store.glyphs[char] ? '保存済み' : '未保存'
    totalText.textContent = `保存した文字 ${Object.keys(store.glyphs).length} / ${allChars().length}`
    saveBtn.disabled = !char || !dirty || store.empty
    pngBtn.disabled = store.empty
  }

  // 全体の保存
  const nameInput = h('input', {
    class: 'text-input',
    type: 'text',
    maxlength: 40,
    'aria-label': 'フォント名',
    oninput: () => {
      store.fontName = nameInput.value
      store.emit('settings')
    },
  })
  nameInput.value = store.fontName
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async () => {
      const file = fileInput.files?.[0]
      fileInput.value = ''
      if (file) await importFile(file, nameInput)
    },
  })
  const needGlyphs = (fn: () => void | Promise<void>) => async () => {
    if (Object.keys(store.glyphs).length === 0) {
      toast('まだ表に保存した文字がありません')
      return
    }
    try {
      await fn()
    } catch (err) {
      console.error(err)
      toast('書き出しに失敗しました')
    }
  }

  const fitButtons = FONT_SIZES.map((s) =>
    h('button', { class: 'seg-btn seg-text', type: 'button', onclick: () => store.set({ fontFit: s.fit }) }, s.label),
  )
  const syncFit = () => {
    fitButtons.forEach((b, i) => b.classList.toggle('active', FONT_SIZES[i].fit === store.settings.fontFit))
  }

  const { root: tables, refresh } = buildTables()
  store.on('settings', syncFit)
  store.on('drawing', () => {
    paintPreview()
    syncStatus()
  })
  store.on('active', () => {
    syncStatus()
    refresh()
  })
  store.on('glyphs', () => {
    syncStatus()
    refresh()
  })

  const { host, body } = scrollArea('right-scroll')
  body.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel-title' }, '文字の状態', helpMark('下の表の文字を押して保存先を選びます。一度保存した文字は、そのあと「保存」ボタンかCtrl+Sで上書きできます。保存した内容はこのブラウザに自動で残ります。')),
      h('div', { class: 'status' }, charBox, h('div', null, stateText, totalText)),
      h('div', { class: 'btn-row' }, saveBtn, pngBtn),
      h('div', { class: 'btn-row' }, newBtn),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel-title' }, '全体の保存', helpMark('「まとめて保存」は表全体を1つのファイルにします。別のパソコンへの移動やバックアップに使い、「読み込む」で元に戻せます。ブラウザのデータを消すと表も消えるので、ときどき保存しておくと安心です。「フォント書き出し」はパソコンにインストールできる.otfファイルを作ります。フォントは単色なので、色は反映されません。')),
      h('label', { class: 'field' }, h('span', { class: 'field-head' }, 'フォント名'), nameInput),
      h(
        'div',
        { class: 'field' },
        h(
          'div',
          { class: 'field-head' },
          'フォントの大きさ',
          helpMark(
            '「プレビューどおり」は、保存した全文字を合わせた範囲が1文字の枠いっぱいになるように拡大して書き出します。全文字に同じ倍率をかけるので、文字どうしの大きさの比や線の太さの比は変わりません。透明な線もこの範囲に含みます。「制作エリアどおり」は、制作エリア全体を1文字の枠として、描いた大きさと基準線の位置のまま書き出します。',
            'フォントの大きさのヘルプ',
          ),
        ),
        h('div', { class: 'seg seg-two' }, ...fitButtons),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: needGlyphs(exportProject) }, 'まとめて保存'),
        h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, '読み込む'),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: needGlyphs(exportZip) }, '全文字PNG'),
        h('button', { class: 'btn primary', type: 'button', onclick: needGlyphs(exportFont) }, 'フォント書き出し'),
      ),
      fileInput,
    ),
    tables,
  )

  root.append(
    h('div', { class: 'preview-wrap' }, h('div', { class: 'preview-frame' }, preview, placeholder)),
    host,
  )
  paintPreview()
  syncStatus()
  syncFit()
  refresh()
}

async function importFile(file: File, nameInput: HTMLInputElement): Promise<void> {
  try {
    const project = parseProject(await file.text())
    if (Object.keys(store.glyphs).length > 0) {
      const ok = await ask(
        '表を置き換えますか？',
        '今の表の内容は、読み込んだファイルの内容に置き換わります。',
        [
          { label: 'やめる', value: false },
          { label: '置き換える', value: true, danger: true },
        ],
        false,
      )
      if (!ok) return
    }
    if (!(await confirmDiscard())) return
    store.replaceTable(project.glyphs, project.rulers ?? [], project.fontName ?? store.fontName)
    nameInput.value = store.fontName
    toast('読み込みました')
  } catch (err) {
    toast(err instanceof Error ? err.message : '読み込みに失敗しました')
  }
}
