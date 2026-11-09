// Statistik penggunaan anonim: ID acak dari perangkat (bukan akun/email), tanpa data jadwal.
// Dikirim ke /api/stat di domain sendiri. Menghormati Do Not Track. Semua kegagalan diabaikan.
const KEY_ID = 'ms_iid'
const KEY_DAY = 'ms_ping_day'

function installId() {
  let id = localStorage.getItem(KEY_ID)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY_ID, id)
  }
  return id
}

export function pingStat(ev) {
  try {
    if (navigator.doNotTrack === '1') return
    if (ev === 'open') {
      const today = new Date().toISOString().slice(0, 10)
      if (localStorage.getItem(KEY_DAY) === today) return
      localStorage.setItem(KEY_DAY, today)
    }
    fetch('/api/stat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: installId(), ev }),
      keepalive: true,
    }).catch(() => {})
  } catch (e) { /* abaikan */ }
}
