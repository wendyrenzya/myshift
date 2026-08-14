# MyShift

Jadwal shift mingguan — personil bertag warna, jumlah shift per hari,
grid mingguan tap-to-assign. Diekstrak dari fitur Planner > Shift di
belanja-app menjadi aplikasi standalone.

Data tersimpan lokal di browser (IndexedDB) — belum ada sinkronisasi
ke server.

## Dev

```
npm install
npm run dev
```

## Deploy

Deploy ke Cloudflare Workers (Static Assets) dengan domain custom
`myshift.my.id` (lihat `wrangler.toml`). Otomatis lewat GitHub Actions
saat push ke `main` — butuh secrets `CF_API_TOKEN` dan `CF_ACCOUNT_ID`
di repo settings.

```
npm run build
npx wrangler deploy
```
