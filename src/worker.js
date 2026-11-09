// Worker tipis: hanya /api/stat (hitung anonim). Selain itu semua dilayani aset statis (SPA).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const EVENTS = { open: [1, 0, 0], backup: [0, 1, 0], restore: [0, 0, 1] }

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname !== '/api/stat') return env.ASSETS.fetch(request)
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    try {
      const b = await request.json()
      const inc = EVENTS[b && b.ev]
      if (!inc || typeof b.id !== 'string' || !UUID_RE.test(b.id)) return new Response(null, { status: 400 })
      const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) // WITA
      await env.DB.prepare(
        `INSERT INTO activity (day, id, opens, backups, restores) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (day, id) DO UPDATE SET opens = opens + excluded.opens,
           backups = backups + excluded.backups, restores = restores + excluded.restores`
      ).bind(day, b.id, ...inc).run()
      return new Response(null, { status: 204 })
    } catch (e) {
      return new Response(null, { status: 400 })
    }
  },
}
