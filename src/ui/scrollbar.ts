import { h } from './dom'

/** ブラウザ標準を隠して、自前のスクロールバーを付けた領域を作る。 */
export function scrollArea(className = ''): { host: HTMLElement; body: HTMLElement } {
  const body = h('div', { class: 'scroll-body' })
  const view = h('div', { class: 'scroll-view' }, body)
  const thumb = h('div', { class: 'scroll-thumb' })
  const track = h('div', { class: 'scroll-track' }, thumb)
  const host = h('div', { class: `scroll-host ${className}` }, view, track)

  const update = () => {
    const { scrollTop, scrollHeight, clientHeight } = view
    const usable = track.clientHeight
    const scrollable = scrollHeight > clientHeight + 1
    host.classList.toggle('can-scroll', scrollable)
    if (!scrollable) return
    const size = Math.max(36, (clientHeight / scrollHeight) * usable)
    const y = (scrollTop / (scrollHeight - clientHeight)) * (usable - size)
    thumb.style.height = `${size}px`
    thumb.style.transform = `translateY(${y}px)`
  }

  view.addEventListener('scroll', update, { passive: true })
  new ResizeObserver(update).observe(view)
  new ResizeObserver(update).observe(body)

  let grab: number | null = null
  const moveTo = (clientY: number) => {
    const rect = track.getBoundingClientRect()
    const size = thumb.offsetHeight
    const ratio = (clientY - rect.top - (grab ?? size / 2)) / (rect.height - size)
    view.scrollTop = ratio * (view.scrollHeight - view.clientHeight)
  }
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    track.setPointerCapture(e.pointerId)
    grab = e.target === thumb ? e.clientY - thumb.getBoundingClientRect().top : null
    if (grab === null) moveTo(e.clientY)
    grab ??= thumb.offsetHeight / 2
    track.classList.add('dragging')
  })
  track.addEventListener('pointermove', (e) => {
    if (track.classList.contains('dragging')) moveTo(e.clientY)
  })
  const release = () => track.classList.remove('dragging')
  track.addEventListener('pointerup', release)
  track.addEventListener('pointercancel', release)

  return { host, body }
}
