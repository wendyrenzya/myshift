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

### Fitur: Absensi
Ide fitur tambahan — di luar scope MVP, belum dieksekusi. Belum ada
detail lebih lanjut (metode absen, integrasi ke grid shift yang
sudah ada, dll — masih perlu digali).

#### Riset teknis: absensi mobile GPS + face matching di web
Konteks: dibandingin sama fitur Gadjian/Talenta (absensi mobile
geo-tagging + face matching). Pertanyaan kunci: apakah semua ini
bisa jalan di web (bukan native app)?

**Batasan browser vs native app:**
- Bisa di web: ambil koordinat GPS (`navigator.geolocation`), ambil
  foto dari kamera depan (`getUserMedia`), face matching, liveness
  check dasar (kedip/gerak kepala/senyum acak).
- TIDAK bisa di web (khusus native app): deteksi flag mock/fake-GPS
  dari OS (`isFromMockProvider()` di Android), liveness check
  berbasis depth-sensor 3D (kayak Face ID TrueDepth), deteksi
  SSID/BSSID WiFi kantor (browser sengaja nggak dikasih akses ini
  demi privasi).
- Konsekuensi: absensi berbasis web tetap BISA dicurangi pakai fake
  GPS app + foto/video lama kalau nggak ada mitigasi tambahan
  (server-side cross-check IP, kecepatan pergerakan gak masuk akal,
  dst). Ini soal menaikkan friction buat curang, bukan menghilangkan
  celah 100% — berlaku juga di app native, cuma levelnya beda.

**Opsi library liveness detection (open source, buat web):**
1. Bikin sendiri pakai face-api.js / MediaPipe / TensorFlow.js +
   instruksi kedip/senyum/gerak kepala — gratis, tapi lemah (bisa
   ditipu video replay).
2. **FaceRecognition-LivenessDetection-Javascript** (Faceplugin-ltd,
   GitHub) — open source, jalan penuh di browser (ONNX Runtime Web +
   OpenCV.js), klaim iBeta level 2 anti-spoofing (deteksi foto
   cetak, video replay, topeng 3D, deepfake), semua proses on-device
   jadi nggak ada biaya API/cloud. Kandidat paling masuk akal buat
   MyShift kalau tetap web-based.
3. AWS Amplify Face Liveness / Luxand.cloud — SDK gratis tapi
   deteksi jalan di server cloud mereka (bayar per-check, data
   keluar ke pihak ketiga). Dihindari kalau mau tetap murah &
   on-device.

**Kesimpulan sementara:** kalau MyShift tetap web-based, level
keamanan absensi realistis-nya "cukup" (GPS + foto + liveness
dasar/opsi 2) — bukan seketat native app. Ini trade-off yang sadar
diambil demi tetap murah & cepat dikembangkan, cocok buat target
UMKM/tim kecil yang nggak butuh anti-fraud level enterprise.
