import { useEffect, useRef } from 'react'

/** Visible without JS/IO. Only explicitly marked, non-media UI is enhanced. */
export function useScrollReveal() {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const host = root.current
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    if (!host || !('IntersectionObserver' in window) || motion.matches) return
    const items = [...host.querySelectorAll<HTMLElement>('[data-reveal]')]
    const show = (item: HTMLElement, immediate = false) => {
      if (immediate) item.classList.add('reveal-immediate')
      item.classList.remove('reveal-pending')
      observer.unobserve(item)
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) show(entry.target as HTMLElement) })
    }, { threshold: 0, rootMargin: '0px 0px -16px 0px' })
    const revealTarget = (target: Element | null) => {
      if (!target || target === document.body || target === document.documentElement) return
      items.forEach(item => { if (item.contains(target) || target.contains(item)) show(item, true) })
    }
    const hash = () => {
      try { revealTarget(document.getElementById(decodeURIComponent(location.hash.slice(1)))) } catch { /* malformed external hash */ }
    }
    items.forEach((item, index) => {
      item.style.setProperty('--reveal-delay', `${index % 3 * 45}ms`)
      // Do not hide content already visible, or content containing live media.
      if (item.getBoundingClientRect().top >= innerHeight && !item.querySelector('video, canvas')) {
        item.classList.add('reveal-pending')
        observer.observe(item)
      }
    })
    const focus = (event: FocusEvent) => revealTarget(event.target instanceof Element ? event.target : null)
    const reduce = () => { if (motion.matches) items.forEach(item => show(item, true)) }
    host.addEventListener('focusin', focus)
    window.addEventListener('hashchange', hash)
    motion.addEventListener('change', reduce)
    hash()
    revealTarget(document.activeElement)
    return () => {
      observer.disconnect()
      host.removeEventListener('focusin', focus)
      window.removeEventListener('hashchange', hash)
      motion.removeEventListener('change', reduce)
      items.forEach(item => {
        item.classList.remove('reveal-pending', 'reveal-immediate')
        item.style.removeProperty('--reveal-delay')
      })
    }
  }, [])
  return root
}
