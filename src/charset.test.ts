import { describe, expect, it } from 'vitest'
import { CHAR_SETS, allChars, fileNameOf, setOf } from './charset'

describe('文字の表', () => {
  it('同じ文字が2回出てこない', () => {
    const chars = allChars()
    expect(new Set(chars).size).toBe(chars.length)
  })

  it('どの文字も1文字で、スペースを含まない', () => {
    for (const c of allChars()) {
      expect([...c]).toHaveLength(1)
      expect(c.trim()).toBe(c)
    }
  })

  it('五十音の空きマスが保たれている', () => {
    const hira = CHAR_SETS.find((s) => s.id === 'hira')!.groups[0].chars
    expect(hira.length % 5).toBe(1)
    expect(hira.slice(35, 40)).toEqual(['や', '', 'ゆ', '', 'よ'])
    expect(hira.slice(45, 50)).toEqual(['わ', '', '', '', 'を'])
    expect(hira[50]).toBe('ん')
  })

  it('数字と記号が入っている', () => {
    expect(setOf('5').id).toBe('digit')
    expect(setOf('?').id).toBe('symbol')
    expect(setOf('、').id).toBe('wide-symbol')
    expect(setOf('・').id).toBe('wide-symbol')
  })

  it('ファイル名に使えない文字は番号になり、名前がかぶらない', () => {
    const names = allChars().map((c) => `${setOf(c).folder}/${fileNameOf(c)}`)
    expect(new Set(names).size).toBe(names.length)
    expect(fileNameOf('A')).toBe('A')
    expect(fileNameOf('あ')).toBe('あ')
    expect(fileNameOf('/')).toBe('U+002F')
    expect(fileNameOf('?')).toBe('U+003F')
    for (const c of allChars()) expect(fileNameOf(c)).not.toMatch(/[\\/:*?"<>|]/)
  })
})
