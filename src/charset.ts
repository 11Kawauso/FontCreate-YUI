/** 表の並び。空文字は空きマス(定義の文字列では半角スペースで書く)。 */
export interface CharGroup {
  label?: string
  cols: number
  chars: string[]
}

export interface CharSet {
  id: string
  title: string
  folder: string
  proportional: boolean
  groups: CharGroup[]
}

const split = (s: string) => [...s].map((c) => (c === ' ' ? '' : c))

export const CHAR_SETS: CharSet[] = [
  {
    id: 'upper',
    title: 'アルファベット 大文字',
    folder: '英大文字',
    proportional: true,
    groups: [{ cols: 6, chars: split('ABCDEFGHIJKLMNOPQRSTUVWXYZ') }],
  },
  {
    id: 'lower',
    title: 'アルファベット 小文字',
    folder: '英小文字',
    proportional: true,
    groups: [{ cols: 6, chars: split('abcdefghijklmnopqrstuvwxyz') }],
  },
  {
    id: 'digit',
    title: '数字',
    folder: '数字',
    proportional: true,
    groups: [{ cols: 5, chars: split('0123456789') }],
  },
  {
    id: 'symbol',
    title: '記号 半角',
    folder: '記号_半角',
    proportional: true,
    groups: [{ cols: 6, chars: split('.,:;!?\'"-_~/\\|()[]{}<>+=*%#&@$^`') }],
  },
  {
    id: 'hira',
    title: 'ひらがな',
    folder: 'ひらがな',
    proportional: false,
    groups: [
      { cols: 5, chars: split('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや ゆ よらりるれろわ   をん') },
      { label: '濁音・半濁音', cols: 5, chars: split('がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ') },
      { label: '小さい文字', cols: 5, chars: split('ぁぃぅぇぉっゃゅょゎ') },
    ],
  },
  {
    id: 'kata',
    title: 'カタカナ',
    folder: 'カタカナ',
    proportional: false,
    groups: [
      { cols: 5, chars: split('アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤ ユ ヨラリルレロワ   ヲン') },
      { label: '濁音・半濁音', cols: 5, chars: split('ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポヴ') },
      { label: '小さい文字・長音', cols: 5, chars: split('ァィゥェォッャュョヮー') },
    ],
  },
  {
    id: 'wide-symbol',
    title: '記号 全角',
    folder: '記号_全角',
    proportional: false,
    groups: [
      { label: '句読点など', cols: 5, chars: split('、。，．・：；？！…‥〜※々〆') },
      { label: 'かっこ', cols: 6, chars: split('「」『』（）【】〈〉《》') },
      { label: '計算・単位', cols: 6, chars: split('＋－×÷＝％＃＆＊＠￥') },
      { label: '矢印・図形', cols: 6, chars: split('→←↑↓○●△▲□■☆★') },
    ],
  },
]

export function allChars(): string[] {
  return CHAR_SETS.flatMap((s) => s.groups.flatMap((g) => g.chars.filter(Boolean)))
}

export function setOf(char: string): CharSet {
  return CHAR_SETS.find((s) => s.groups.some((g) => g.chars.includes(char)))!
}

/** ファイル名に使う文字。半角記号はWindowsで使えないものがあるので番号にする。 */
export function fileNameOf(char: string): string {
  const code = char.codePointAt(0)!
  if (code > 0x7f || /[A-Za-z0-9]/.test(char)) return char
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
}
