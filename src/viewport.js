// Keep fixed overlays aligned with the visible viewport when the virtual keyboard opens.
const root = document.documentElement

function updateViewport() {
  const viewport = window.visualViewport
  const height = viewport?.height || window.innerHeight
  root.style.setProperty('--viewport-height', `${height}px`)
  root.classList.toggle('keyboard-open', !!viewport && window.innerHeight - viewport.height > 120)
}

updateViewport()
window.visualViewport?.addEventListener('resize', updateViewport)
window.visualViewport?.addEventListener('scroll', updateViewport)
window.addEventListener('resize', updateViewport)

document.addEventListener('focusin', event => {
  const field = event.target
  if (!(field instanceof HTMLElement) || !field.matches('input, textarea, select')) return
  setTimeout(() => field.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }), 250)
})
