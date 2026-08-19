// Service worker minimal — cuma syarat teknis biar Chrome mau munculin prompt "Install"
// (butuh fetch handler terdaftar). MyShift emang gak butuh network buat jalan, jadi belum
// ada caching/offline logic di sini, cuma pass-through ke network apa adanya.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
