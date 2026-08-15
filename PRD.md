# MyShift — PRD

## Ringkasan
Aplikasi jadwal shift mingguan buat tim kecil (ronda malam, toko, kafe,
dll). Personil bertag warna, jumlah & nama shift per hari bisa
disesuaikan, grid mingguan tap-to-assign, bisa dibagikan sebagai
JPG/PDF. Diekstrak dari fitur Planner > Shift di belanja-app jadi
aplikasi standalone.

## Status saat ini (MVP)
- **Free, local-only** — semua fitur (multi-jadwal, personil,
  multi-shift per hari, tandai libur, catatan mingguan, duplikat
  jadwal minggu lalu, backup/import JSON) tersedia gratis.
- Data tersimpan di IndexedDB perangkat masing-masing — **belum ada
  cloud sync**.
- Berbagi jadwal ke tim lewat **export JPG/PDF** (snapshot manual,
  di-generate ulang tiap kali admin mau share versi terbaru).
- **Belum ada fitur snapshot link / cloud sync.**

## Keputusan scope
- **MVP dirilis free dulu, tanpa snapshot link maupun cloud sync.**
  Alasan: validasi dulu apakah orang butuh cara share selain
  JPG/PDF, sebelum invest ke infra cloud (Worker + D1) dan skema
  monetisasi.

## Rencana ke depan (belum dieksekusi)

### Fitur: Role viewer read-only (link share)
Link khusus yang bisa dibagikan ke tim, mereka bisa lihat jadwal
tanpa install app dan tanpa bisa edit.

Dua pendekatan yang dipertimbangkan:
1. **Snapshot statis** — generate file JSON/HTML sekali pas admin
   share, upload ke R2, dapat link unik. Nggak live/real-time.
   Lebih ringan dibangun.
2. **Sync cloud live** — Worker + D1, data ditulis ke cloud tiap
   admin ubah jadwal, viewer selalu lihat versi terbaru. Butuh
   restrukturisasi jadi online-first/hybrid.

### Estimasi biaya infra (Cloudflare, kalau dipakai rame)
- Skala kecil–menengah (ratusan–ribuan tim): tetap dalam free tier
  Cloudflare (Workers 100rb request/hari, D1 5GB + 5jt baca/hari +
  100rb tulis/hari, R2 10GB).
- Skala besar (≈10.000 tim aktif, ~50 viewer/tim/hari, ~20 edit/
  hari/tim): perkiraan **~$12–15/bulan** (base Workers Paid $5 +
  overage request + D1 rows written, D1 read hampir gratis).
- Skala 10x lebih besar (~100.000 tim): perkiraan naik ke **~$60–100/
  bulan**. Masih murah dibanding backend tradisional.
- Kesimpulan: cost bukan alasan kuat buat maksa fitur ini jadi
  berbayar — kalaupun dimonetisasi, alasannya value-based (bukan
  cost-recovery).

### Skema monetisasi kalau nanti fitur ini dibuat berbayar
Dipertimbangkan model **freemium flat per akun (bukan per personil)**:
- Free: app lokal (kondisi sekarang), tanpa link viewer/cloud sync.
- Pro: cloud sync + unlimited link viewer + multi-device.
  - Langganan flat ~Rp 15.000–25.000/bulan atau ~Rp 129.000–149.000/
    tahun, ATAU
  - Alternatif one-time purchase ~Rp 79.000–129.000 (konsisten sama
    gaya [[pdf-reflow-app]]).
- Alasan flat (bukan per-karyawan kayak kompetitor HRIS
  Talenta/Gadjian Rp 12.500–20.000/karyawan/bulan): target MyShift
  tim kecil, cost cloud-nya juga flat per-tim, dan jadi selling
  point "satu harga berapa pun orangnya".
