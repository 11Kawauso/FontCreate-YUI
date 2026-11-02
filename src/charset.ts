/** 表の並び。空文字は空きマス。 */
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

const split = (s: string) => [...s].map((c) => (c === '・' ? '' : c))

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
    id: 'hira',
    title: 'ひらがな',
    folder: 'ひらがな',
    proportional: false,
    groups: [
      { cols: 5, chars: split('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや・ゆ・よらりるれろわ・・・をん') },
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
      { cols: 5, chars: split('アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤ・ユ・ヨラリルレロワ・・・ヲン') },
      { label: '濁音・半濁音', cols: 5, chars: split('ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポヴ') },
      { label: '小さい文字・長音', cols: 5, chars: split('ァィゥェォッャュョヮー') },
    ],
  },
]

export function allChars(): string[] {
  return CHAR_SETS.flatMap((s) => s.groups.flatMap((g) => g.chars.filter(Boolean)))
}

export function setOf(char: string): CharSet {
  return CHAR_SETS.find((s) => s.groups.some((g) => g.chars.includes(char)))!
}
