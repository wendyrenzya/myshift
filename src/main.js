import './viewport.js'
import { svgIcon } from './icons.js'
import { getAllLocal, putLocal, deleteLocal } from './db.js'
import { driveIsConfigured, driveSignIn, driveSignOut, driveUpload, driveDownload } from './drive.js'

// Logo resmi Google Drive (segitiga 4 warna) — dipakai di tombol connect, biar keliatan jelas ini fitur Google Drive
const GDRIVE_LOGO = '<svg width="16" height="16" viewBox="0 0 87.3 78" style="vertical-align:-3px;margin-right:4px" aria-hidden="true"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25l13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>'

const USERS32 = svgIcon('usersRound').replace('<svg ', '<svg style="width:32px;height:32px" ')

const DAYS_ID   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const FAQ_ITEMS = [
  { q: 'Apa itu MyShift?', a: 'Aplikasi buat atur jadwal shift tim — bisa buat kerja kantoran, ronda malam, atau apa aja yang butuh jadwal bergilir mingguan.' },
  { q: 'Data disimpan di mana?', a: 'Semua data (jadwal, personil, catatan) tersimpan langsung di HP/browser kamu (IndexedDB), bukan di server. Jadi gak perlu akun buat mulai pakai.' },
  { q: 'Gimana kalau HP hilang atau data browser dihapus?', a: 'Karena datanya lokal di perangkat, kalau cache/data browser dihapus atau ganti HP, jadwal yang belum di-backup akan ikut hilang. Pakai tombol "Backup Data" di halaman jadwal secara rutin, simpan file JSON-nya, lalu "Import Data" buat mulihin di perangkat baru.' },
  { q: 'Bisa dipakai bareng banyak admin sekaligus?', a: 'Untuk sekarang datanya per-perangkat (belum ada sinkronisasi cloud), jadi paling cocok satu orang yang atur jadwal, lalu hasilnya dibagikan (JPG/PDF) ke tim lewat WhatsApp atau lainnya.' },
  { q: 'Berapa banyak jadwal & personil yang bisa dibuat?', a: 'Gak dibatasi — bisa bikin banyak jadwal (misalnya Shift Kantor, Shift Ronda Malam) dan masing-masing punya personil sendiri-sendiri.' },
]

const app = document.getElementById('app')

// ── State ──
const SHIFT_COLORS = ['#E11D48','#EA580C','#D97706','#65A30D','#059669','#0891B2','#2563EB','#7C3AED','#C026D3','#DB2777']
let showLanding = true           // splash/landing pas pertama buka (per sesi)
let deferredInstallPrompt = null // event beforeinstallprompt yang ditahan, dipicu manual lewat tombol Install
let installAvailable = false     // true kalau Chrome/Edge (Android, Windows, desktop) kasih sinyal siap-install
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
let openFaqIndex = null          // index FAQ yang lagi kebuka
let shiftSchedules = []          // daftar jadwal shift (Shift Kantor, Shift Ronda Malam, dst)
let activeScheduleId = null      // jadwal yang lagi dibuka; null = halaman daftar jadwal
let showScheduleForm = false     // sheet buat jadwal baru
let gridViewMode = 'old'         // 'old' (per-hari) atau 'new' (kartu per-shift) — dipilih lewat tombol Edit
let showByNameView = false       // true = tampilan Lihat (matrix personil x hari, ringkas) — dipilih lewat tombol Lihat
let shiftPersonnel = [], shiftConfig = null, shiftAssignments = []   // scoped ke activeScheduleId
let shiftLeaves = []         // { personnel_id, date } — personil yang libur, scoped ke activeScheduleId
let showShiftSettings = false    // popup kelola personil & shift utk jadwal aktif
let shiftWeekStart = fmtYMD(mondayOfWeek(new Date()))
let activeShiftCell = null   // { day, shift } saat sheet assign personil terbuka
let lastToggledPid = null    // buat trigger animasi pop pas assign/undo
let showShareSheet = false
let shiftNoteText = ''       // catatan minggu yang lagi dibuka
let showNotesSheet = false   // popup catatan
let sharing = false          // lagi generate JPG/PDF (disable tombol biar gak double-tap)
let driveConnected = false   // status sign-in Google Drive — session-only, gak persist antar buka app (lihat catatan di drive.js)
let driveBusy = false        // lagi proses sign-in/backup/restore ke Drive (disable tombol biar gak double-tap)
let driveStatusText = ''     // feedback terakhir, misal "Tersimpan ke Drive · 10:32"
let confirmDialog = null     // { title, message, danger, resolve } — pengganti window.confirm() bawaan browser
let openTimeRangeIndices = new Set()  // index shift yang lagi kebuka input range waktunya

// ── Suara pop (disintesis, gak perlu file audio) ──
let audioCtx = null
function playPopSound(added) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const ctx = audioCtx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(added ? 520 : 340, now)
    osc.frequency.exponentialRampToValueAtTime(added ? 880 : 210, now + 0.12)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(now); osc.stop(now + 0.19)
  } catch (e) { /* suara opsional, abaikan kalau AudioContext gak tersedia */ }
}

// ── Load ──
async function loadSchedules() {
  shiftSchedules = await getAllLocal('shift_schedules')
}

async function loadShiftData() {
  const allPersonnel = await getAllLocal('shift_personnel')
  shiftPersonnel = allPersonnel.filter(p => p.schedule_id === activeScheduleId)
  const configs = await getAllLocal('shift_config')
  shiftConfig = configs.find(c => c.schedule_id === activeScheduleId) || null
  const allAssignments = await getAllLocal('shift_assignments')
  shiftAssignments = allAssignments.filter(a => a.schedule_id === activeScheduleId)
}

async function loadWeekNote() {
  const id = `${activeScheduleId}::${shiftWeekStart}`
  const all = await getAllLocal('shift_notes')
  const note = all.find(n => n.id === id)
  shiftNoteText = note ? note.text : ''
}

async function saveWeekNote(text) {
  const id = `${activeScheduleId}::${shiftWeekStart}`
  if (!text) {
    await deleteLocal('shift_notes', id)
    shiftNoteText = ''
    return
  }
  await putLocal('shift_notes', { id, schedule_id: activeScheduleId, week_start: shiftWeekStart, text, updated_at: Date.now() })
  shiftNoteText = text
}

async function loadLeaves() {
  const all = await getAllLocal('shift_leaves')
  shiftLeaves = all.filter(l => l.schedule_id === activeScheduleId)
}

function dateForDay(dayIndex) {
  const d = new Date(shiftWeekStart + 'T00:00:00'); d.setDate(d.getDate() + dayIndex)
  return fmtYMD(d)
}

function isOnLeave(pid, dayIndex) {
  const date = dateForDay(dayIndex)
  return shiftLeaves.some(l => l.personnel_id === pid && l.date === date)
}

async function toggleLeave(pid, dayIndex) {
  const date = dateForDay(dayIndex)
  const id = `${pid}::${date}`
  if (shiftLeaves.some(l => l.id === id)) {
    await deleteLocal('shift_leaves', id)
  } else {
    await putLocal('shift_leaves', { id, schedule_id: activeScheduleId, personnel_id: pid, date, created_at: Date.now() })
  }
  await loadLeaves()
  render()
}

function mondayOfWeek(d) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function fmtYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtWeekRange(weekStartStr) {
  const start = new Date(weekStartStr + 'T00:00:00')
  const end = new Date(start); end.setDate(start.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const startStr = `${start.getDate()}${sameMonth ? '' : ' ' + MONTHS_ID[start.getMonth()]}`
  const endStr = `${end.getDate()} ${MONTHS_ID[end.getMonth()]} ${end.getFullYear()}`
  return `${startStr} – ${endStr}`
}

function shiftWeekAdd(deltaDays) {
  const d = new Date(shiftWeekStart + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  shiftWeekStart = fmtYMD(d)
}

function isCurrentWeek() {
  return shiftWeekStart === fmtYMD(mondayOfWeek(new Date()))
}

function findOtherShiftSameDay(pid, day, currentShiftIdx) {
  const a = shiftAssignments.find(x => x.week_start === shiftWeekStart && x.day_index === day && x.shift_index !== currentShiftIdx && (x.personnel_ids || []).includes(pid))
  if (!a) return null
  return shiftConfig.shift_labels[a.shift_index] || `Shift ${a.shift_index + 1}`
}

// ══════════════════════════════════════════════════════════
// ── LANDING PAGE (splash pertama + FAQ) ──
// ══════════════════════════════════════════════════════════

// Logo splash: pecah jadi grid 4x4 "kotak kecil" yang masing-masing nunjukin potongan gambar,
// tiap kotak mulai dari posisi acak lalu menyatu ke tempatnya masing-masing (efek assemble/mosaic)
function renderSplashTiles() {
  let html = ''
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const dx = Math.round((Math.random() * 2 - 1) * 70)
      const dy = Math.round((Math.random() * 2 - 1) * 70)
      const rot = Math.round((Math.random() * 2 - 1) * 50)
      const delay = Math.round((x + y * 4) * 22 + Math.random() * 40)
      html += `<span class="pl-splash-tile" style="left:${x * 25}%;top:${y * 25}%;background-position:${x * 33.333}% ${y * 33.333}%;--dx:${dx}px;--dy:${dy}px;--rot:${rot}deg;animation-delay:${delay}ms"></span>`
    }
  }
  return html
}

function renderLanding() {
  return `
    <div class="pl-landing">
      <div class="pl-landing-hero">
        <div class="pl-landing-icon">${renderSplashTiles()}</div>
        <div class="pl-landing-title">MyShift</div>
        <div style="margin:-14px 0 10px;font-size:11px;font-weight:600;letter-spacing:.02em;color:#9a978f">Powered by Qilo</div>
        <div class="pl-landing-sub">Susun shift tanpa perlu buka spreadsheet — cukup klik nama. Tanpa ribet ngetik, tanpa bikin tabel, tanpa copy-paste, dan langsung bagikan sebagai JPG atau PDF.</div>
        <button type="button" class="pl-landing-cta" id="pl-landing-start">
          <span>Mulai Sekarang</span>
          ${svgIcon('chevronDown').replace('<svg ', '<svg style="width:15px;height:15px;transform:rotate(-90deg)" ')}
        </button>
      </div>
      <div class="pl-landing-features">
        <div class="pl-feature-card">
          <span class="pl-feature-tag">Unlimited</span>
          <span class="pl-feature-icon-badge" style="background:#DCFCE7;color:#16A34A">${svgIcon('usersRound').replace('<svg ', '<svg style="width:20px;height:20px" ')}</span>
          <div class="pl-feature-card-title">Bikin Banyak Jadwal</div>
        </div>
        <div class="pl-feature-card">
          <span class="pl-feature-icon-badge" style="background:#FFE4DC;color:#EA580C">${svgIcon('share').replace('<svg ', '<svg style="width:20px;height:20px" ')}</span>
          <div class="pl-feature-card-title">Bagikan Sekali Tap</div>
        </div>
        <div class="pl-feature-card">
          <span class="pl-feature-icon-badge" style="background:#DBEAFE;color:#2563EB">${svgIcon('download').replace('<svg ', '<svg style="width:20px;height:20px" ')}</span>
          <div class="pl-feature-card-title">Backup Kapan Aja</div>
        </div>
        <div class="pl-feature-card">
          <span class="pl-feature-icon-badge" style="background:#F3E8FF;color:#9333EA">${svgIcon('gift').replace('<svg ', '<svg style="width:20px;height:20px" ')}</span>
          <div class="pl-feature-card-title">Gratis Tanpa Langganan</div>
        </div>
      </div>
      <div class="pl-faq">
        <div class="pl-faq-title">Pertanyaan Umum</div>
        ${FAQ_ITEMS.map((item, i) => `
          <div class="pl-faq-item">
            <button type="button" class="pl-faq-q ${openFaqIndex === i ? 'open' : ''}" data-i="${i}">
              <span>${esc(item.q)}</span>
              ${svgIcon(openFaqIndex === i ? 'minus' : 'plus').replace('<svg ', '<svg style="width:16px;height:16px" ')}
            </button>
            ${openFaqIndex === i ? `<div class="pl-faq-a">${esc(item.a)}</div>` : ''}
          </div>
        `).join('')}
      </div>
      <a href="https://renzya.my.id" target="_blank" rel="noopener" class="pl-feature-request-link">
        ${svgIcon('externalLink').replace('<svg ', '<svg style="width:14px;height:14px" ')} Support kami dengan membeli ebook di sini
      </a>
      <div style="text-align:center;padding:16px 0 8px">
        <a href="/privacy" target="_blank" rel="noopener" style="color:#6B6B6B;font-size:12.5px;font-weight:600">Kebijakan Privasi</a>
      </div>
    </div>
  `
}

function wireLanding() {
  app.querySelector('#pl-landing-start').addEventListener('click', () => { showLanding = false; render() })
  app.querySelectorAll('.pl-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i)
      openFaqIndex = openFaqIndex === i ? null : i
      render()
    })
  })
}

// iOS Safari gak support beforeinstallprompt — satu-satunya cara install PWA di sana
// adalah manual lewat menu Share, jadi tombolnya cuma nunjukin caranya.
async function handleInstallClick() {
  if (isIOS) {
    await customAlert('Tap ikon Share (kotak dengan panah ke atas) di bar Safari, lalu pilih "Tambah ke Layar Utama".', { title: 'Install di iPhone/iPad' })
    return
  }
  if (!deferredInstallPrompt) return
  deferredInstallPrompt.prompt()
  await deferredInstallPrompt.userChoice
  deferredInstallPrompt = null
  installAvailable = false
  render()
}

// ══════════════════════════════════════════════════════════
// ── HALAMAN DAFTAR JADWAL (home) ──
// ══════════════════════════════════════════════════════════

function renderScheduleHome() {
  return `
    <div class="pl-sched-logo"><span class="pl-sched-logo-frame"><img src="/Full.png" alt="MyShift" /></span></div>
    <div class="pl-sched-intro">
      <div class="pl-sched-intro-title">List Jadwal</div>
      <div class="pl-sched-intro-sub">Tiap jadwal punya personil & jadwal mingguan sendiri-sendiri.</div>
    </div>
    ${shiftSchedules.length === 0 ? `
      <div class="empty">
        <div class="empty-icon">${USERS32}</div>
        <div class="empty-title">Belum ada jadwal shift</div>
        <div class="empty-sub">Buat jadwal pertama, misalnya "Shift Kantor" atau "Shift Ronda Malam".</div>
      </div>
    ` : `
      <div class="pl-sched-list">
        ${shiftSchedules.map(s => `
          <div class="pl-sched-card" data-id="${s.id}">
            <span class="pl-shift-dot" style="background:${s.color}"></span>
            <span class="pl-sched-card-name">${esc(s.name)}</span>
            <button type="button" class="pl-sched-del" data-id="${s.id}" aria-label="Hapus jadwal">${svgIcon('trash').replace('<svg ', '<svg style="width:16px;height:16px" ')}</button>
          </div>
        `).join('')}
      </div>
    `}
    <div style="display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap">
      <button type="button" class="pl-submit pl-submit-auto" id="pl-sched-add">+ Buat Jadwal Baru</button>
      ${!isStandaloneApp && (installAvailable || isIOS) ? `
        <button type="button" class="pl-backup-btn" id="pl-install-btn" style="width:auto;border-radius:999px;padding:11px 20px">${svgIcon('download').replace('<svg ', '<svg style=\"width:16px;height:16px\" ')} ${isIOS ? 'Tambah ke Layar Utama' : 'Install'}</button>
      ` : ''}
    </div>

    <div class="pl-backup-box">
      <div class="pl-backup-title">${svgIcon('download').replace('<svg ', '<svg style="width:15px;height:15px" ')} Backup &amp; Restore Data</div>
      <div class="pl-backup-hint pl-backup-hint-main">Data cuma tersimpan di perangkat ini. Backup rutin biar gak hilang kalau ganti HP atau cache browser kehapus.</div>
      <div class="pl-backup-actions">
        <button type="button" class="pl-backup-btn" id="pl-backup-export">${svgIcon('download').replace('<svg ', '<svg style="width:16px;height:16px" ')} Backup (JSON)</button>
        <button type="button" class="pl-backup-btn" id="pl-backup-import">${svgIcon('upload').replace('<svg ', '<svg style="width:16px;height:16px" ')} Restore (JSON)</button>
      </div>
      <input type="file" id="pl-backup-file-input" accept="application/json,.json" style="display:none" />

      <div class="pl-backup-divider"></div>
      ${!driveIsConfigured() ? `
        <div class="pl-backup-hint" style="margin-bottom:0">Backup ke Google Drive belum diaktifkan developer.</div>
      ` : `
        <div class="pl-drive-notice">
          ${svgIcon('info').replace('<svg ', '<svg style="width:15px;height:15px" ')}
          <span>Backup ini tersimpan di <strong>Drive kamu sendiri</strong>, bukan di server kami — kami nggak nyimpen atau bisa lihat isinya. Karena itu, kamu mungkin perlu <strong>login ulang tiap mau Backup/Restore</strong>, tergantung sesi Google di browser masih aktif atau nggak. Baca <a href="/privacy" target="_blank" rel="noopener">Kebijakan Privasi</a> kami.</span>
        </div>
        ${!driveConnected ? `
          <button type="button" class="pl-backup-btn" id="pl-drive-connect" style="width:100%" ${driveBusy ? 'disabled' : ''}>${GDRIVE_LOGO} ${driveBusy ? 'Menghubungkan…' : 'Backup/Restore dengan Google Drive'}</button>
        ` : `
          <div class="pl-backup-actions">
            <button type="button" class="pl-backup-btn" id="pl-drive-backup" ${driveBusy ? 'disabled' : ''}>${svgIcon('cloudUpload').replace('<svg ', '<svg style="width:16px;height:16px" ')} Backup ke Drive</button>
            <button type="button" class="pl-backup-btn" id="pl-drive-restore" ${driveBusy ? 'disabled' : ''}>${svgIcon('cloudDownload').replace('<svg ', '<svg style="width:16px;height:16px" ')} Restore dari Drive</button>
          </div>
          ${driveStatusText ? `<div class="pl-backup-hint" style="margin-top:8px;margin-bottom:0">${esc(driveStatusText)}</div>` : ''}
          <button type="button" class="pl-drive-disconnect" id="pl-drive-disconnect">Putuskan Google Drive</button>
        `}
      `}
    </div>

    <a href="https://forms.gle/6YD55dFtQAUL4oiQ8" target="_blank" rel="noopener" class="pl-feature-request-link">
      ${svgIcon('externalLink').replace('<svg ', '<svg style="width:14px;height:14px" ')} Request Fitur Baru
    </a>

    ${showScheduleForm ? renderScheduleFormSheet() : ''}
  `
}

function wireScheduleHome() {
  app.querySelector('#pl-sched-add').addEventListener('click', () => { showScheduleForm = true; render() })
  const installBtn = app.querySelector('#pl-install-btn')
  if (installBtn) installBtn.addEventListener('click', handleInstallClick)
  app.querySelectorAll('.pl-sched-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.pl-sched-del')) return
      enterSchedule(card.dataset.id)
    })
  })
  app.querySelectorAll('.pl-sched-del').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteSchedule(btn.dataset.id) })
  })
  app.querySelector('#pl-backup-export').addEventListener('click', exportBackup)
  app.querySelector('#pl-backup-import').addEventListener('click', () => app.querySelector('#pl-backup-file-input').click())
  app.querySelector('#pl-backup-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (file) importBackupFile(file)
    e.target.value = ''
  })
  const driveConnectBtn = app.querySelector('#pl-drive-connect')
  if (driveConnectBtn) driveConnectBtn.addEventListener('click', driveConnect)
  const driveBackupBtn = app.querySelector('#pl-drive-backup')
  if (driveBackupBtn) driveBackupBtn.addEventListener('click', driveBackupNow)
  const driveRestoreBtn = app.querySelector('#pl-drive-restore')
  if (driveRestoreBtn) driveRestoreBtn.addEventListener('click', driveRestoreNow)
  const driveDisconnectBtn = app.querySelector('#pl-drive-disconnect')
  if (driveDisconnectBtn) driveDisconnectBtn.addEventListener('click', driveDisconnect)
  if (showScheduleForm) wireScheduleFormSheet()
}

async function driveConnect() {
  if (driveBusy) return
  driveBusy = true; render()
  try {
    await driveSignIn()
    driveConnected = true
    driveStatusText = 'Terhubung. Belum ada backup tersimpan di sesi ini.'
  } catch (err) {
    console.error(err)
    await customAlert('Belum berhasil terhubung ke Google Drive. Kalau tombol Backup/Restore belum muncul, tap "Hubungkan Google Drive" lagi.')
  } finally {
    driveBusy = false; render()
  }
}

async function driveBackupNow() {
  if (driveBusy) return
  driveBusy = true; render()
  try {
    const [schedules, personnel, configs, assignments, notes, leaves] = await Promise.all(BACKUP_STORES.map(getAllLocal))
    const backup = { app: 'myshift', version: 1, exported_at: new Date().toISOString(), schedules, personnel, configs, assignments, notes, leaves }
    const modifiedTime = await driveUpload(JSON.stringify(backup, null, 2))
    driveStatusText = `Tersimpan ke Drive · ${new Date(modifiedTime || Date.now()).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
  } catch (err) {
    console.error(err)
    if (err.message && err.message.includes('Sesi Google Drive habis')) driveConnected = false
    await customAlert(err.message || 'Gagal backup ke Drive.')
  } finally {
    driveBusy = false; render()
  }
}

async function driveRestoreNow() {
  if (driveBusy) return
  if (!(await customConfirm('Restore dari Drive akan MENGGANTI semua data yang ada sekarang (semua jadwal, personil, dan histori). Lanjutkan?', { danger: true, okLabel: 'Ya, Timpa' }))) return
  driveBusy = true; render()
  try {
    const result = await driveDownload()
    if (!result) {
      await customAlert('Belum ada backup MyShift di Drive akun ini.')
      driveBusy = false; render()
      return
    }
    const data = JSON.parse(result.text)
    if (data.app !== 'myshift' || !Array.isArray(data.schedules)) throw new Error('File backup di Drive tidak valid.')
    for (const name of BACKUP_STORES) {
      const existing = await getAllLocal(name)
      for (const rec of existing) await deleteLocal(name, rec.id)
    }
    const map = { shift_schedules: data.schedules, shift_personnel: data.personnel, shift_config: data.configs, shift_assignments: data.assignments, shift_notes: data.notes, shift_leaves: data.leaves }
    for (const name of BACKUP_STORES) {
      for (const rec of (map[name] || [])) await putLocal(name, rec)
    }
    activeScheduleId = null
    await loadSchedules()
    driveStatusText = `Direstore dari Drive · ${new Date(result.modifiedTime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
    await customAlert('Restore dari Drive berhasil!')
  } catch (err) {
    console.error(err)
    if (err.message && err.message.includes('Sesi Google Drive habis')) driveConnected = false
    await customAlert(err.message || 'Gagal restore dari Drive.')
  } finally {
    driveBusy = false; render()
  }
}

function driveDisconnect() {
  driveSignOut()
  driveConnected = false
  driveStatusText = ''
  render()
}

function renderScheduleFormSheet() {
  return `
    <div class="pl-overlay pl-overlay-center" id="pl-sched-form-overlay">
      <div class="pl-sheet pl-sheet-center">
        <div class="pl-sheet-title">Jadwal Shift Baru</div>
        <div class="pl-sheet-hint">Nama jadwal, misalnya "Shift Kantor" atau "Shift Ronda Malam".</div>
        <input id="pl-sched-name-input" type="text" placeholder="Nama jadwal…" autocomplete="off" />
        <button type="button" class="pl-submit" id="pl-sched-form-done" style="margin-top:12px">Buat Jadwal</button>
      </div>
    </div>
  `
}

function wireScheduleFormSheet() {
  const overlay = app.querySelector('#pl-sched-form-overlay')
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { showScheduleForm = false; render() } })
  const submit = async () => {
    const input = app.querySelector('#pl-sched-name-input')
    const v = input.value.trim()
    if (!v) return
    await createSchedule(v)
  }
  app.querySelector('#pl-sched-form-done').addEventListener('click', submit)
  app.querySelector('#pl-sched-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit() } })
}

async function createSchedule(name) {
  const id = crypto.randomUUID()
  const color = SHIFT_COLORS[shiftSchedules.length % SHIFT_COLORS.length]
  await putLocal('shift_schedules', { id, name, color, created_at: Date.now() })
  await loadSchedules()
  showScheduleForm = false
  await enterSchedule(id)
}

async function deleteSchedule(id) {
  const s = shiftSchedules.find(x => x.id === id)
  const name = s ? s.name : 'jadwal ini'
  if (!(await customConfirm(`Hapus jadwal "${name}"? Semua personil dan jadwal mingguan di dalamnya juga ikut terhapus.`, { danger: true }))) return
  await deleteLocal('shift_schedules', id)
  await deleteLocal('shift_config', id)
  const allPersonnel = await getAllLocal('shift_personnel')
  for (const p of allPersonnel.filter(p => p.schedule_id === id)) await deleteLocal('shift_personnel', p.id)
  const allAssignments = await getAllLocal('shift_assignments')
  for (const a of allAssignments.filter(a => a.schedule_id === id)) await deleteLocal('shift_assignments', a.id)
  const allNotes = await getAllLocal('shift_notes')
  for (const n of allNotes.filter(n => n.schedule_id === id)) await deleteLocal('shift_notes', n.id)
  const allLeaves = await getAllLocal('shift_leaves')
  for (const l of allLeaves.filter(l => l.schedule_id === id)) await deleteLocal('shift_leaves', l.id)
  await loadSchedules()
  render()
}

async function enterSchedule(id) {
  activeScheduleId = id
  await loadShiftData()
  await loadWeekNote()
  await loadLeaves()
  showShiftSettings = !(shiftPersonnel.length > 0 && shiftConfig && shiftConfig.shifts_per_day > 0)
  activeShiftCell = null
  showShareSheet = false
  showNotesSheet = false
  render()
}

// ══════════════════════════════════════════════════════════
// ── BACKUP & IMPORT (JSON, mencakup semua jadwal) ──
// ══════════════════════════════════════════════════════════

const BACKUP_STORES = ['shift_schedules', 'shift_personnel', 'shift_config', 'shift_assignments', 'shift_notes', 'shift_leaves']

async function exportBackup() {
  const [schedules, personnel, configs, assignments, notes, leaves] = await Promise.all(BACKUP_STORES.map(getAllLocal))
  const backup = { app: 'myshift', version: 1, exported_at: new Date().toISOString(), schedules, personnel, configs, assignments, notes, leaves }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  await shareFileOrDownload(blob, `myshift-backup-${fmtYMD(new Date())}.json`, 'application/json', 'Backup MyShift')
}

async function importBackupFile(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch (e) {
    await customAlert('File tidak valid. Pastikan file JSON hasil backup MyShift.')
    return
  }
  if (data.app !== 'myshift' || !Array.isArray(data.schedules)) {
    await customAlert('File tidak valid. Pastikan file JSON hasil backup MyShift.')
    return
  }
  if (!(await customConfirm('Import akan MENGGANTI semua data yang ada sekarang (semua jadwal, personil, dan histori) dengan isi file ini. Lanjutkan?', { danger: true, okLabel: 'Ya, Timpa' }))) return
  for (const name of BACKUP_STORES) {
    const existing = await getAllLocal(name)
    for (const rec of existing) await deleteLocal(name, rec.id)
  }
  const map = { shift_schedules: data.schedules, shift_personnel: data.personnel, shift_config: data.configs, shift_assignments: data.assignments, shift_notes: data.notes, shift_leaves: data.leaves }
  for (const name of BACKUP_STORES) {
    for (const rec of (map[name] || [])) await putLocal(name, rec)
  }
  activeScheduleId = null
  await loadSchedules()
  await customAlert('Import berhasil! Data sudah diganti sesuai file backup.')
  render()
}

// ══════════════════════════════════════════════════════════
// ── KELOLA PERSONIL & SHIFT (dalam satu jadwal) ──
// ══════════════════════════════════════════════════════════

function renderTimeRangeBoxes(i, t) {
  t = t || {}
  const isLast = shiftConfig && i === shiftConfig.shifts_per_day - 1
  return `
    <div class="pl-shift-time-range">
      <input type="text" inputmode="numeric" maxlength="2" class="pl-time-box" data-i="${i}" data-field="startH" value="${esc(t.startH || '')}" placeholder="00" />
      <span class="pl-time-sep">:</span>
      <input type="text" inputmode="numeric" maxlength="2" class="pl-time-box" data-i="${i}" data-field="startM" value="${esc(t.startM || '')}" placeholder="00" />
      <span class="pl-time-sep">–</span>
      <input type="text" inputmode="numeric" maxlength="2" class="pl-time-box" data-i="${i}" data-field="endH" value="${esc(t.endH || '')}" placeholder="00" />
      <span class="pl-time-sep">:</span>
      <input type="text" inputmode="numeric" maxlength="2" class="pl-time-box" data-i="${i}" data-field="endM" value="${esc(t.endM || '')}" placeholder="00" />
      <span class="pl-time-24h-hint">Format 24 jam</span>
    </div>
    ${isLast ? `<button type="button" class="pl-time-autofill" id="pl-time-autofill-last">Isi otomatis dari sisa jam shift lain</button>` : ''}
  `
}

function renderShiftSettingsSheet(onboarding) {
  const n = shiftConfig ? shiftConfig.shifts_per_day : 2
  const labels = shiftConfig ? shiftConfig.shift_labels : []
  const times = shiftConfig ? (shiftConfig.shift_times || []) : []
  return `
    <div class="pl-overlay pl-overlay-center" id="pl-shift-settings-overlay">
      <div class="pl-sheet pl-sheet-center">
        <div class="pl-sheet-title">Kelola Personil & Shift</div>
        ${onboarding ? `
          <div class="pl-onboard-intro">
            <div class="pl-onboard-title">Yuk, atur jadwal shift</div>
            <div class="pl-onboard-sub">Tambahkan nama tim, lalu tentukan berapa kali shift dalam sehari. Jadwal mingguan otomatis muncul setelah ini terisi.</div>
          </div>
        ` : ''}
        <div class="pl-proj-detail-label">1. Personil</div>
        <div class="pl-tag-wrap" style="margin-bottom:10px">
          ${shiftPersonnel.length === 0 ? '<span class="pl-list-empty" style="padding:4px 0">Belum ada personil.</span>' : shiftPersonnel.map(p => `
            <span class="pl-person-chip" style="border-color:${p.color}">
              <span class="pl-shift-dot" style="background:${p.color}"></span>${esc(p.name)}
              <button type="button" class="pl-person-del" data-id="${p.id}">${svgIcon('closeIcon').replace('<svg ', '<svg style="width:11px;height:11px" ')}</button>
            </span>
          `).join('')}
        </div>
        <div class="pl-tag-input-row">
          <input id="pl-person-input" type="text" placeholder="Nama personil…" autocomplete="off" />
          <button type="button" class="pl-tag-add-btn" id="pl-person-add">+ Tambah</button>
        </div>

        <div class="pl-proj-detail-label" style="margin-top:16px">2. Jumlah shift per hari</div>
        <div class="pl-shift-count-row">
          <input id="pl-shift-count" type="number" min="1" max="8" value="${n}" />
          <span class="pl-list-empty" style="padding:0">tiap hari dibagi rata</span>
        </div>
        ${shiftConfig ? `
          <div class="pl-proj-detail-label" style="margin-top:16px">3. Nama tiap shift</div>
          <div class="pl-sheet-hint">Ganti label default ("Shift 1", "Shift 2", dst) sesuai kebutuhan, misalnya Pagi / Siang / Malam.</div>
          <div class="pl-shift-labels">
            ${labels.map((l, i) => {
              const t = times[i]
              const formatted = formatShiftTime(t)
              const isOpen = openTimeRangeIndices.has(i)
              return `
                <div class="pl-shift-label-block">
                  <input type="text" class="pl-shift-label-input" data-i="${i}" value="${esc(l)}" placeholder="Nama shift ${i + 1}…" />
                  <button type="button" class="pl-shift-time-toggle" data-i="${i}">${formatted ? `⏱ ${esc(formatted)} (ubah)` : '+ tambahkan range waktu spesifik (opsional)'}</button>
                  ${isOpen ? renderTimeRangeBoxes(i, t) : ''}
                </div>
              `
            }).join('')}
          </div>
        ` : ''}
        <button type="button" class="pl-submit" id="pl-shift-settings-done" style="margin-top:16px">Simpan</button>
      </div>
    </div>
  `
}

function wireShiftSettingsSheet() {
  const overlay = app.querySelector('#pl-shift-settings-overlay')
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { showShiftSettings = false; render() } })
  app.querySelector('#pl-shift-settings-done').addEventListener('click', async () => { if (!shiftConfig) await updateShiftCount(2); showShiftSettings = false; render() })
  const addPerson = async () => {
    const input = app.querySelector('#pl-person-input')
    const v = input.value.trim()
    if (!v) return
    await addShiftPersonnel(v)
  }
  app.querySelector('#pl-person-add').addEventListener('click', addPerson)
  app.querySelector('#pl-person-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } })
  app.querySelectorAll('.pl-person-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = shiftPersonnel.find(x => x.id === btn.dataset.id)
      const name = p ? p.name : 'personil ini'
      if (await customConfirm(`Hapus ${name} dari daftar personil? Jadwal yang sudah diisi untuk orang ini juga akan dikosongkan.`, { danger: true })) {
        deleteShiftPersonnel(btn.dataset.id)
      }
    })
  })
  app.querySelector('#pl-shift-count').addEventListener('change', e => {
    updateShiftCount(Number(e.target.value) || 1)
  })
  app.querySelectorAll('.pl-shift-label-input').forEach(inp => {
    wireClearOnFirstKeystroke(inp)
    inp.addEventListener('change', e => {
      updateShiftLabel(Number(inp.dataset.i), e.target.value.trim())
    })
  })
  app.querySelectorAll('.pl-shift-time-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i)
      if (openTimeRangeIndices.has(i)) openTimeRangeIndices.delete(i)
      else openTimeRangeIndices.add(i)
      render()
    })
  })
  app.querySelectorAll('.pl-time-box').forEach(inp => {
    wireClearOnFirstKeystroke(inp)
    inp.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2)
      if (e.target.value.length === 2) {
        const i = e.target.dataset.i
        const boxes = Array.from(app.querySelectorAll(`.pl-time-box[data-i="${i}"]`))
        const idx = boxes.indexOf(e.target)
        if (idx > -1 && idx < boxes.length - 1) boxes[idx + 1].focus()
      }
    })
    inp.addEventListener('blur', e => { handleTimeBoxBlur(e.target) })
  })
  const autofillBtn = app.querySelector('#pl-time-autofill-last')
  if (autofillBtn) autofillBtn.addEventListener('click', autofillLastShiftTime)
}

async function addShiftPersonnel(name) {
  const color = SHIFT_COLORS[shiftPersonnel.length % SHIFT_COLORS.length]
  await putLocal('shift_personnel', { id: crypto.randomUUID(), schedule_id: activeScheduleId, name, color, created_at: Date.now() })
  await loadShiftData()
  render()
}

async function deleteShiftPersonnel(pid) {
  await deleteLocal('shift_personnel', pid)
  for (const a of shiftAssignments) {
    if ((a.personnel_ids || []).includes(pid)) {
      await putLocal('shift_assignments', { ...a, personnel_ids: a.personnel_ids.filter(id => id !== pid) })
    }
  }
  for (const l of shiftLeaves.filter(l => l.personnel_id === pid)) await deleteLocal('shift_leaves', l.id)
  await loadShiftData()
  await loadLeaves()
  render()
}

async function updateShiftCount(newCount) {
  newCount = Math.max(1, Math.min(8, newCount))
  const oldLabels = shiftConfig ? shiftConfig.shift_labels : []
  const newLabels = Array.from({ length: newCount }, (_, i) => oldLabels[i] || `Shift ${i + 1}`)
  const oldTimes = shiftConfig && shiftConfig.shift_times ? shiftConfig.shift_times : []
  const newTimes = Array.from({ length: newCount }, (_, i) => oldTimes[i] || null)
  shiftConfig = { id: activeScheduleId, schedule_id: activeScheduleId, shifts_per_day: newCount, shift_labels: newLabels, shift_times: newTimes }
  await putLocal('shift_config', shiftConfig)
  render()
}

// Format tampilan "HH:MM – HH:MM" — null kalau belum semua 4 kotak keisi (opsional, gak wajib diisi)
function formatShiftTime(t) {
  if (!t || !t.startH || !t.startM || !t.endH || !t.endM) return null
  return `${t.startH}:${t.startM} – ${t.endH}:${t.endM}`
}

function timeToMin(h, m) { return Number(h) * 60 + Number(m) }

// Cek 2 range waktu bentrok atau nggak — nyebrang tengah malam (end <= start) dianggap lanjut ke hari berikutnya.
function timesOverlap(a, b) {
  const aS = timeToMin(a.startH, a.startM)
  const aE0 = timeToMin(a.endH, a.endM)
  const aE = aE0 <= aS ? aE0 + 1440 : aE0
  const bS = timeToMin(b.startH, b.startM)
  const bE0 = timeToMin(b.endH, b.endM)
  const bE = bE0 <= bS ? bE0 + 1440 : bE0
  return aS < bE && bS < aE
}

async function updateShiftTimeField(index, field, rawValue) {
  const times = shiftConfig.shift_times ? [...shiftConfig.shift_times] : []
  while (times.length < shiftConfig.shifts_per_day) times.push(null)
  const cur = times[index] || {}
  const next = { ...cur, [field]: rawValue }
  const allEmpty = !next.startH && !next.startM && !next.endH && !next.endM
  times[index] = allEmpty ? null : next
  shiftConfig = { ...shiftConfig, shift_times: times }
  await putLocal('shift_config', shiftConfig)
  render()

  // Range shift ini baru aja lengkap (4 kotak keisi semua) -> cek bentrok sama shift lain
  const t = times[index]
  if (t && t.startH && t.startM && t.endH && t.endM) {
    for (let j = 0; j < times.length; j++) {
      if (j === index) continue
      const o = times[j]
      if (!o || !o.startH || !o.startM || !o.endH || !o.endM) continue
      if (timesOverlap(t, o)) {
        const labels = shiftConfig.shift_labels
        await customAlert(`Range waktu ini bentrok dengan "${esc(labels[j] || 'Shift ' + (j + 1))}" (${o.startH}:${o.startM} – ${o.endH}:${o.endM}). Range shift ini di-reset, isi ulang ya.`, { title: 'Range waktu bentrok' })
        times[index] = null
        shiftConfig = { ...shiftConfig, shift_times: times }
        await putLocal('shift_config', shiftConfig)
        render()
        break
      }
    }
  }
}

// Isi otomatis shift TERAKHIR dengan sisa waktu dari 24 jam yang belum ke-cover shift lain
// (mulai = jam akhir paling telat di antara shift lain, sampai = jam mulai paling awal di antara shift lain)
async function autofillLastShiftTime() {
  const n = shiftConfig.shifts_per_day
  const lastIdx = n - 1
  const times = shiftConfig.shift_times || []
  const others = times.filter((t, i) => i !== lastIdx && t && t.startH && t.startM && t.endH && t.endM)
  if (others.length === 0) {
    await customAlert('Isi range waktu shift lain dulu, baru bisa di-autofill dari sisanya.')
    return
  }
  let maxEnd = null, maxEndMin = -1
  let minStart = null, minStartMin = Infinity
  others.forEach(o => {
    const startMin = timeToMin(o.startH, o.startM)
    const endMin0 = timeToMin(o.endH, o.endM)
    const endMin = endMin0 <= startMin ? endMin0 + 1440 : endMin0
    if (endMin > maxEndMin) { maxEndMin = endMin; maxEnd = { h: o.endH, m: o.endM } }
    if (startMin < minStartMin) { minStartMin = startMin; minStart = { h: o.startH, m: o.startM } }
  })
  const newTimes = [...times]
  while (newTimes.length < n) newTimes.push(null)
  newTimes[lastIdx] = { startH: maxEnd.h, startM: maxEnd.m, endH: minStart.h, endM: minStart.m }
  shiftConfig = { ...shiftConfig, shift_times: newTimes }
  await putLocal('shift_config', shiftConfig)
  render()
}

// Validasi 1 kotak angka (jam 00-23 atau menit 00-59), format 24 jam.
// 1 digit -> otomatis ditambah 0 di depan. Kalau di luar rentang wajar -> munculin warning, reset ke 00.
async function handleTimeBoxBlur(input) {
  const i = Number(input.dataset.i)
  const field = input.dataset.field
  const isHour = field === 'startH' || field === 'endH'
  const max = isHour ? 23 : 59
  let raw = input.value.replace(/\D/g, '')
  if (raw === '') { await updateShiftTimeField(i, field, ''); return }
  if (raw.length === 1) raw = '0' + raw
  const num = parseInt(raw, 10)
  if (num > max) {
    await customAlert(`${isHour ? 'Jam' : 'Menit'} harus antara 00–${max} (format 24 jam).`, { title: isHour ? 'Jam tidak valid' : 'Menit tidak valid' })
    raw = '00'
  }
  await updateShiftTimeField(i, field, raw)
}

async function updateShiftLabel(index, value) {
  const newLabels = [...shiftConfig.shift_labels]
  newLabels[index] = value || `Shift ${index + 1}`
  shiftConfig = { ...shiftConfig, shift_labels: newLabels }
  await putLocal('shift_config', shiftConfig)
  render()
}

// ══════════════════════════════════════════════════════════
// ── GRID MINGGUAN — 3 tampilan (toggle) ──
// ══════════════════════════════════════════════════════════

// Tampilan lama: per-hari, cell shift berjejer ke samping (default, lebih disukai)
function renderShiftGridOld() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const start = new Date(shiftWeekStart + 'T00:00:00')
  let html = ''
  for (let di = 0; di < 7; di++) {
    const d = new Date(start); d.setDate(start.getDate() + di)
    const dayLabel = `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]}`
    html += `<div class="pl-shift-day">
      <div class="pl-shift-day-label">${dayLabel}</div>
      <div class="pl-shift-cells">`
    for (let si = 0; si < n; si++) {
      const assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === di && a.shift_index === si)
      const people = (assign ? assign.personnel_ids : []).map(pid => shiftPersonnel.find(p => p.id === pid)).filter(Boolean)
      const isSpot1 = activeShiftCell && activeShiftCell.day === di && activeShiftCell.shift === si
      html += `<div class="pl-shift-cell ${isSpot1 ? 'pl-cell-spotlight' : ''}" data-day="${di}" data-shift="${si}">
        <div class="pl-shift-cell-label">${esc(labels[si] || ('Shift ' + (si + 1)))}</div>
        ${people.length === 0
          ? '<div class="pl-shift-cell-empty">+ isi personil</div>'
          : `<div class="pl-shift-cell-people">${people.map(p => `<span class="pl-shift-chip" style="border-color:${p.color};background:${p.color}22"><span class="pl-shift-dot" style="background:${p.color}"></span>${esc(p.name.split(' ')[0])}</span>`).join('')}</div>`}
      </div>`
    }
    html += `</div></div>`
  }
  return html
}

// Tampilan baru: satu kartu per shift, isinya 7 baris hari
function renderShiftGridCards() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const start = new Date(shiftWeekStart + 'T00:00:00')
  let html = ''
  for (let si = 0; si < n; si++) {
    html += `<div class="pl-shift-card">
      <div class="pl-shift-card-header">${esc(labels[si] || ('Shift ' + (si + 1)))}</div>
      <div class="pl-shift-card-rows">`
    for (let di = 0; di < 7; di++) {
      const d = new Date(start); d.setDate(start.getDate() + di)
      const dayLabel = `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]}`
      const assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === di && a.shift_index === si)
      const people = (assign ? assign.personnel_ids : []).map(pid => shiftPersonnel.find(p => p.id === pid)).filter(Boolean)
      const isSpot2 = activeShiftCell && activeShiftCell.day === di && activeShiftCell.shift === si
      html += `<div class="pl-shift-row ${isSpot2 ? 'pl-cell-spotlight' : ''}" data-day="${di}" data-shift="${si}">
        <div class="pl-shift-row-day">${dayLabel}</div>
        ${people.length === 0
          ? '<div class="pl-shift-cell-empty">+ isi personil</div>'
          : `<div class="pl-shift-row-people">${people.map(p => `<span class="pl-shift-chip" style="border-color:${p.color};background:${p.color}22"><span class="pl-shift-dot" style="background:${p.color}"></span>${esc(p.name.split(' ')[0])}</span>`).join('')}</div>`}
      </div>`
    }
    html += `</div></div>`
  }
  return html
}

// Kode ringkas per shift buat tampilan Lihat — hindari tabrakan huruf pertama
// (misal "Shift 1" & "Shift 2" sama-sama mulai huruf "S"): coba angka di akhir label dulu,
// baru 2-huruf-inisial, baru nomor urut shift sebagai jalan terakhir.
function computeShiftCodes(labels) {
  const clean = labels.map(l => (l || '').trim())
  const codes = clean.map(l => l.charAt(0).toUpperCase() || '?')
  const findDupes = arr => arr.map((v, i) => arr.some((w, j) => j !== i && w === v))
  findDupes(codes).forEach((isDup, i) => {
    if (!isDup) return
    const m = clean[i].match(/(\d+)\s*$/)
    if (m) codes[i] = codes[i] + m[1]
  })
  findDupes(codes).forEach((isDup, i) => {
    if (!isDup) return
    const words = clean[i].split(/\s+/).filter(Boolean)
    codes[i] = words.length > 1
      ? (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
      : clean[i].slice(0, 2).replace(/^./, c => c.toUpperCase())
  })
  findDupes(codes).forEach((isDup, i) => { if (isDup) codes[i] = codes[i] + (i + 1) })
  return codes
}

// Tampilan nama: matrix personil x hari, ringkas — cell = kode shift + warna, legenda di bawah
function renderShiftGridByName() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const codes = computeShiftCodes(labels)
  const times = shiftConfig.shift_times || []
  const start = new Date(shiftWeekStart + 'T00:00:00')
  const today = fmtYMD(new Date())
  const longestName = shiftPersonnel.reduce((max, p) => Math.max(max, (p.name || '').length), 0)
  const nameColWidth = Math.min(280, Math.max(132, longestName * 8 + 38))
  const dayHeaders = []
  for (let di = 0; di < 7; di++) {
    const d = new Date(start); d.setDate(start.getDate() + di)
    dayHeaders.push({ abbr: DAYS_ID[d.getDay()].slice(0, 3), date: d.getDate(), isToday: fmtYMD(d) === today })
  }
  let rowsHtml = ''
  for (const p of shiftPersonnel) {
    let cellsHtml = ''
    for (let di = 0; di < 7; di++) {
      const onLeave = isOnLeave(p.id, di)
      let si = -1
      for (let k = 0; k < n; k++) {
        const a = shiftAssignments.find(x => x.week_start === shiftWeekStart && x.day_index === di && x.shift_index === k)
        if (a && (a.personnel_ids || []).includes(p.id)) { si = k; break }
      }
      if (onLeave) {
        cellsHtml += `<td class="pl-shift-byname-cell pl-byname-leave"><span class="pl-byname-code">L</span><span class="pl-byname-label">Libur</span></td>`
      } else if (si === -1) {
        cellsHtml += `<td class="pl-shift-byname-cell pl-byname-empty"><span class="pl-byname-code">–</span><span class="pl-byname-label">Kosong</span></td>`
      } else {
        const color = SHIFT_COLORS[si % SHIFT_COLORS.length]
        const label = labels[si] || `Shift ${si + 1}`
        const formatted = formatShiftTime(times[si])
        cellsHtml += `<td class="pl-shift-byname-cell" style="background:${color}22;color:${color};border-color:${color}55"><span class="pl-byname-code">${esc(codes[si])}</span><span class="pl-byname-label">${esc(label)}</span>${formatted ? `<small class="pl-byname-time">${esc(formatted)}</small>` : ''}</td>`
      }
    }
    rowsHtml += `<tr><td class="pl-shift-byname-name"><span class="pl-shift-dot" style="background:${p.color}"></span><span>${esc(p.name)}</span></td>${cellsHtml}</tr>`
  }
  const headerHtml = dayHeaders.map(h => `
    <th>
      <div class="pl-byname-day">${h.abbr}</div>
      <svg class="pl-byname-date${h.isToday ? ' today' : ''}" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="10"></circle>
        <text x="11" y="11" text-anchor="middle" dominant-baseline="central">${h.date}</text>
      </svg>
    </th>
  `).join('')
  return `
    <div class="pl-shift-byname-wrap" style="--matrix-name-width:${nameColWidth}px">
      <table class="pl-shift-byname-table">
        <thead><tr><th></th>${headerHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="pl-byname-legend">
      <span class="pl-byname-legend-item"><span class="pl-byname-legend-dot" style="background:#9CA3AF"></span>L = Libur</span>
    </div>
  `
}

function renderShiftSheet() {
  const { day, shift } = activeShiftCell
  const label = shiftConfig.shift_labels[shift] || `Shift ${shift + 1}`
  const d = new Date(shiftWeekStart + 'T00:00:00'); d.setDate(d.getDate() + day)
  const dayLabel = `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]}`
  const assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === day && a.shift_index === shift)
  const assignedIds = assign ? assign.personnel_ids : []
  return `
    <div class="pl-overlay" id="pl-shift-overlay">
      <div class="pl-sheet">
        <div class="pl-sheet-title">${esc(label)} — ${dayLabel}</div>
        <div class="pl-sheet-hint">Tap nama untuk menandai siapa saja yang masuk shift ini.</div>
        <div class="pl-sheet-chips">
          ${shiftPersonnel.map(p => {
            const checked = assignedIds.includes(p.id)
            const other = findOtherShiftSameDay(p.id, day, shift)
            const onLeave = isOnLeave(p.id, day)
            const justToggled = p.id === lastToggledPid
            return `<div class="pl-sheet-person-row">
              <button type="button" class="pl-sheet-chip ${checked ? 'checked' : ''} ${onLeave ? 'onleave' : ''} ${justToggled ? 'pl-pop' : ''}" data-pid="${p.id}" style="border-color:${p.color};${checked ? `background:${p.color}` : ''}">
                <span class="pl-shift-dot" style="background:${checked ? '#fff' : p.color}"></span>${esc(p.name)}${onLeave ? '<span class="pl-sheet-conflict">· libur</span>' : (other ? `<span class="pl-sheet-conflict">· sudah di ${esc(other)}</span>` : '')}
              </button>
              <button type="button" class="pl-sheet-leave-btn ${onLeave ? 'active' : ''}" data-leave-pid="${p.id}" aria-label="Tandai libur" title="Tandai libur hari ini">${svgIcon('ban').replace('<svg ', '<svg style="width:15px;height:15px" ')}</button>
            </div>`
          }).join('')}
        </div>
        <button type="button" class="pl-submit" id="pl-sheet-done">Selesai</button>
      </div>
    </div>
  `
}

function wireShiftSheet() {
  const overlay = app.querySelector('#pl-shift-overlay')
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { activeShiftCell = null; render() } })
  app.querySelector('#pl-sheet-done').addEventListener('click', () => { activeShiftCell = null; render() })
  app.querySelectorAll('.pl-sheet-chip').forEach(btn => {
    btn.addEventListener('click', () => toggleShiftAssign(btn.dataset.pid))
  })
  app.querySelectorAll('.pl-sheet-leave-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { day } = activeShiftCell
      toggleLeave(btn.dataset.leavePid, day)
    })
  })
}

async function toggleShiftAssign(pid) {
  const { day, shift } = activeShiftCell
  let assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === day && a.shift_index === shift)
  if (!assign) assign = { id: crypto.randomUUID(), schedule_id: activeScheduleId, week_start: shiftWeekStart, day_index: day, shift_index: shift, personnel_ids: [] }
  const idx = assign.personnel_ids.indexOf(pid)
  const added = idx === -1
  if (added) assign.personnel_ids.push(pid); else assign.personnel_ids.splice(idx, 1)
  assign.updated_at = Date.now()
  await putLocal('shift_assignments', assign)
  await loadShiftData()
  playPopSound(added)
  lastToggledPid = pid
  render()
  lastToggledPid = null
}

async function duplicatePreviousWeek() {
  const prevDate = new Date(shiftWeekStart + 'T00:00:00'); prevDate.setDate(prevDate.getDate() - 7)
  const prevWeekStart = fmtYMD(prevDate)
  const allAssignments = await getAllLocal('shift_assignments')
  const prevAssignments = allAssignments.filter(a => a.schedule_id === activeScheduleId && a.week_start === prevWeekStart && (a.personnel_ids || []).length > 0)
  if (prevAssignments.length === 0) { await customAlert('Minggu sebelumnya belum ada jadwal yang bisa diduplikat.'); return }
  const hasCurrent = shiftAssignments.some(a => (a.personnel_ids || []).length > 0)
  if (hasCurrent && !(await customConfirm('Jadwal minggu ini sudah ada isinya. Timpa dengan jadwal minggu lalu?', { okLabel: 'Ya, Timpa' }))) return
  const currentAssignments = allAssignments.filter(a => a.schedule_id === activeScheduleId && a.week_start === shiftWeekStart)
  for (const a of currentAssignments) await deleteLocal('shift_assignments', a.id)
  for (const pa of prevAssignments) {
    await putLocal('shift_assignments', {
      id: crypto.randomUUID(), schedule_id: activeScheduleId, week_start: shiftWeekStart,
      day_index: pa.day_index, shift_index: pa.shift_index,
      personnel_ids: [...(pa.personnel_ids || [])], updated_at: Date.now()
    })
  }
  await loadShiftData()
  render()
}

// ══════════════════════════════════════════════════════════
// ── EKSPOR / BAGIKAN (JPG & PDF) — format per-hari (samain sama tampilan lama) ──
// ══════════════════════════════════════════════════════════

// Format "Hari": satu blok per hari, isinya baris tiap shift — samain sama tab Hari
function buildExportBodyDays() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const start = new Date(shiftWeekStart + 'T00:00:00')
  let html = ''
  for (let di = 0; di < 7; di++) {
    const d = new Date(start); d.setDate(start.getDate() + di)
    const dayLabel = `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]}`
    let rowsHtml = ''
    for (let si = 0; si < n; si++) {
      const assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === di && a.shift_index === si)
      const people = (assign ? assign.personnel_ids : []).map(pid => shiftPersonnel.find(p => p.id === pid)).filter(Boolean)
      rowsHtml += `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${si < n - 1 ? 'border-bottom:1px solid #EEEEEC' : ''}">
          <div style="width:92px;flex-shrink:0;font-size:12px;font-weight:700;color:#6B6B6B;text-transform:uppercase;letter-spacing:.02em">${esc(labels[si] || ('Shift ' + (si + 1)))}</div>
          <div style="flex:1;display:flex;flex-wrap:wrap;gap:6px">
            ${people.length === 0
              ? '<span style="font-size:13px;color:#B0B0AC">— belum ada —</span>'
              : people.map(p => `<span style="display:inline-flex;align-items:center;gap:5px;border:1px solid ${p.color};border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;color:#1A1A1A"><span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>${esc(p.name)}</span>`).join('')}
          </div>
        </div>`
    }
    html += `
      <div style="margin-bottom:14px">
        <div style="font-size:13.5px;font-weight:700;color:#1A1A1A;margin-bottom:4px">${dayLabel}</div>
        <div style="background:#FAFAF8;border:1px solid #EEEEEC;border-radius:12px;padding:4px 12px">${rowsHtml}</div>
      </div>`
  }
  return html
}

// Format "Shift": satu blok per shift, isinya baris tiap hari — samain sama tab Shift
function buildExportBodyShifts() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const start = new Date(shiftWeekStart + 'T00:00:00')
  let html = ''
  for (let si = 0; si < n; si++) {
    let rowsHtml = ''
    for (let di = 0; di < 7; di++) {
      const d = new Date(start); d.setDate(start.getDate() + di)
      const dayLabel = `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]}`
      const assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === di && a.shift_index === si)
      const people = (assign ? assign.personnel_ids : []).map(pid => shiftPersonnel.find(p => p.id === pid)).filter(Boolean)
      rowsHtml += `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${di < 6 ? 'border-bottom:1px solid #EEEEEC' : ''}">
          <div style="width:150px;flex-shrink:0;font-size:12.5px;font-weight:600;color:#484848">${dayLabel}</div>
          <div style="flex:1;display:flex;flex-wrap:wrap;gap:6px">
            ${people.length === 0
              ? '<span style="font-size:13px;color:#B0B0AC">— belum ada —</span>'
              : people.map(p => `<span style="display:inline-flex;align-items:center;gap:5px;border:1px solid ${p.color};border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;color:#1A1A1A"><span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>${esc(p.name)}</span>`).join('')}
          </div>
        </div>`
    }
    html += `
      <div style="margin-bottom:14px;border-radius:12px;overflow:hidden;border:1px solid #EEEEEC">
        <div style="background:#1A2B48;color:#fff;font-size:13.5px;font-weight:700;padding:10px 14px">${esc(labels[si] || ('Shift ' + (si + 1)))}</div>
        <div style="padding:4px 14px;background:#fff">${rowsHtml}</div>
      </div>`
  }
  return html
}

// Format "Matriks": tabel personil x hari — samain sama tab Matriks
function buildExportBodyMatrix() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const codes = computeShiftCodes(labels)
  const start = new Date(shiftWeekStart + 'T00:00:00')
  const dayHeaders = []
  for (let di = 0; di < 7; di++) {
    const d = new Date(start); d.setDate(start.getDate() + di)
    dayHeaders.push(`${DAYS_ID[d.getDay()].slice(0, 3)} ${d.getDate()}`)
  }
  let rowsHtml = ''
  for (const p of shiftPersonnel) {
    let cellsHtml = ''
    for (let di = 0; di < 7; di++) {
      const onLeave = isOnLeave(p.id, di)
      let si = -1
      for (let k = 0; k < n; k++) {
        const a = shiftAssignments.find(x => x.week_start === shiftWeekStart && x.day_index === di && x.shift_index === k)
        if (a && (a.personnel_ids || []).includes(p.id)) { si = k; break }
      }
      if (onLeave) {
        cellsHtml += `<td style="text-align:center;padding:8px 4px;font-size:12px;font-weight:700;color:#6B7280;background:#F3F4F6;border:1px solid #EEEEEC">L</td>`
      } else if (si === -1) {
        cellsHtml += `<td style="text-align:center;padding:8px 4px;font-size:12px;color:#B0B0AC;background:#FAFAF8;border:1px solid #EEEEEC">–</td>`
      } else {
        const color = SHIFT_COLORS[si % SHIFT_COLORS.length]
        cellsHtml += `<td style="text-align:center;padding:8px 4px;font-size:12px;font-weight:700;color:${color};background:${color}22;border:1px solid #EEEEEC">${esc(codes[si])}</td>`
      }
    }
    rowsHtml += `<tr><td style="padding:8px 10px;font-size:12.5px;font-weight:600;color:#1A1A1A;white-space:nowrap;border:1px solid #EEEEEC">${esc(p.name)}</td>${cellsHtml}</tr>`
  }
  const times = shiftConfig.shift_times || []
  const legendItems = labels.slice(0, n).map((l, si) => {
    const label = l || `Shift ${si + 1}`
    const color = SHIFT_COLORS[si % SHIFT_COLORS.length]
    const t = formatShiftTime(times[si])
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#6B6B6B;margin-right:12px"><span style="width:9px;height:9px;border-radius:3px;background:${color};display:inline-block"></span>${esc(codes[si])} = ${esc(label)}${t ? ` (${esc(t)})` : ''}</span>`
  }).join('')
  return `
    <table style="border-collapse:collapse;width:100%;margin-bottom:10px">
      <thead><tr><th></th>${dayHeaders.map(h => `<th style="font-size:11px;font-weight:700;color:#6B6B6B;padding:4px;border:1px solid #EEEEEC;background:#FAFAF8">${h}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div>${legendItems}<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#6B6B6B"><span style="width:9px;height:9px;border-radius:3px;background:#9CA3AF;display:inline-block"></span>L = Libur</span></div>
  `
}

function buildExportCard() {
  const sched = shiftSchedules.find(s => s.id === activeScheduleId)
  const bodyHtml = showByNameView ? buildExportBodyMatrix() : gridViewMode === 'new' ? buildExportBodyShifts() : buildExportBodyDays()

  const card = document.createElement('div')
  card.style.cssText = 'position:fixed;left:-9999px;top:0;width:720px;background:#ffffff;padding:32px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div style="font-size:22px;font-weight:800;color:#1A2B48">${esc(sched ? sched.name : 'Jadwal Shift')}</div>
      <div style="font-size:13px;font-weight:700;color:#1A2B48;background:#E8ECF2;padding:5px 12px;border-radius:999px">${fmtWeekRange(shiftWeekStart)}</div>
    </div>
    <div style="height:1px;background:#EEEEEC;margin:16px 0 20px"></div>
    ${shiftNoteText ? `<div style="background:#FFF8E1;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:#78350F;white-space:pre-wrap">${esc(shiftNoteText)}</div>` : ''}
    ${bodyHtml}
    <div style="margin-top:8px;text-align:center;font-size:11.5px;color:#B0B0AC">Dibuat dengan MyShift · myshift.my.id · ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</div>
  `
  document.body.appendChild(card)
  return card
}

async function captureShiftCanvas() {
  const { default: html2canvas } = await import('html2canvas')
  const card = buildExportCard()
  try {
    const canvas = await html2canvas(card, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    return canvas
  } finally {
    card.remove()
  }
}

function exportFilename(ext) {
  const sched = shiftSchedules.find(s => s.id === activeScheduleId)
  const slug = sched ? sched.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'jadwal'
  return `jadwal-shift-${slug}-${shiftWeekStart}.${ext}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function shareFileOrDownload(blob, filename, mime, shareTitle = 'Jadwal Shift') {
  const file = new File([blob], filename, { type: mime })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle })
      return
    } catch (err) {
      if (err && err.name === 'AbortError') return // user batal share, jangan fallback ke download
    }
  }
  triggerDownload(blob, filename)
}

async function shareAsImage() {
  if (sharing) return
  sharing = true; showShareSheet = false; render()
  try {
    const canvas = await captureShiftCanvas()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92))
    await shareFileOrDownload(blob, exportFilename('jpg'), 'image/jpeg')
  } catch (err) {
    console.error('Gagal membuat JPG:', err)
    await customAlert('Gagal membuat gambar. Coba lagi.')
  } finally {
    sharing = false; render()
  }
}

async function downloadAsImage() {
  if (sharing) return
  sharing = true; showShareSheet = false; render()
  try {
    const canvas = await captureShiftCanvas()
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92))
    triggerDownload(blob, exportFilename('jpg'))
  } catch (err) {
    console.error('Gagal membuat JPG:', err)
    await customAlert('Gagal membuat gambar. Coba lagi.')
  } finally {
    sharing = false; render()
  }
}

async function shareAsPDF() {
  if (sharing) return
  sharing = true; showShareSheet = false; render()
  try {
    const [canvas, { jsPDF }] = await Promise.all([captureShiftCanvas(), import('jspdf')])
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] })
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height)
    const blob = pdf.output('blob')
    await shareFileOrDownload(blob, exportFilename('pdf'), 'application/pdf')
  } catch (err) {
    console.error('Gagal membuat PDF:', err)
    await customAlert('Gagal membuat PDF. Coba lagi.')
  } finally {
    sharing = false; render()
  }
}

async function downloadAsPDF() {
  if (sharing) return
  sharing = true; showShareSheet = false; render()
  try {
    const [canvas, { jsPDF }] = await Promise.all([captureShiftCanvas(), import('jspdf')])
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] })
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height)
    const blob = pdf.output('blob')
    triggerDownload(blob, exportFilename('pdf'))
  } catch (err) {
    console.error('Gagal membuat PDF:', err)
    await customAlert('Gagal membuat PDF. Coba lagi.')
  } finally {
    sharing = false; render()
  }
}

function renderShareSheet() {
  const sched = shiftSchedules.find(s => s.id === activeScheduleId)
  return `
    <div class="pl-overlay" id="pl-share-overlay">
      <div class="pl-sheet">
        <div class="pl-sheet-title">${esc(sched ? sched.name : 'Jadwal')}: ${fmtWeekRange(shiftWeekStart)}</div>
        <div class="pl-share-grid">
          <button type="button" class="pl-share-opt" id="pl-share-jpg">
            ${svgIcon('image').replace('<svg ', '<svg style="width:20px;height:20px" ')}
            <span>Bagikan JPG</span>
          </button>
          <button type="button" class="pl-share-opt" id="pl-share-pdf">
            ${svgIcon('fileText').replace('<svg ', '<svg style="width:20px;height:20px" ')}
            <span>Bagikan PDF</span>
          </button>
          <button type="button" class="pl-share-opt" id="pl-download-jpg">
            ${svgIcon('download').replace('<svg ', '<svg style="width:20px;height:20px" ')}
            <span>Download JPG</span>
          </button>
          <button type="button" class="pl-share-opt" id="pl-download-pdf">
            ${svgIcon('download').replace('<svg ', '<svg style="width:20px;height:20px" ')}
            <span>Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  `
}

function wireShareSheet() {
  const overlay = app.querySelector('#pl-share-overlay')
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { showShareSheet = false; render() } })
  app.querySelector('#pl-share-jpg').addEventListener('click', shareAsImage)
  app.querySelector('#pl-share-pdf').addEventListener('click', shareAsPDF)
  app.querySelector('#pl-download-jpg').addEventListener('click', downloadAsImage)
  app.querySelector('#pl-download-pdf').addEventListener('click', downloadAsPDF)
}

function renderNotesSheet() {
  return `
    <div class="pl-overlay" id="pl-notes-overlay">
      <div class="pl-sheet">
        <div class="pl-sheet-title">Catatan — ${fmtWeekRange(shiftWeekStart)}</div>
        <div class="pl-sheet-hint">Muncul juga di JPG/PDF pas dibagikan. Kosongkan buat menghapus.</div>
        <textarea id="pl-notes-textarea" rows="4" placeholder="Tulis catatan buat minggu ini…">${esc(shiftNoteText)}</textarea>
        <button type="button" class="pl-submit" id="pl-notes-done" style="margin-top:12px">Simpan</button>
      </div>
    </div>
  `
}

function wireNotesSheet() {
  const overlay = app.querySelector('#pl-notes-overlay')
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { showNotesSheet = false; render() } })
  app.querySelector('#pl-notes-done').addEventListener('click', async () => {
    const text = app.querySelector('#pl-notes-textarea').value.trim()
    await saveWeekNote(text)
    showNotesSheet = false
    render()
  })
}

// ══════════════════════════════════════════════════════════
// ── DETAIL JADWAL (grid mingguan satu jadwal) ──
// ══════════════════════════════════════════════════════════

function renderScheduleDetail() {
  const ready = shiftPersonnel.length > 0 && shiftConfig && shiftConfig.shifts_per_day > 0
  const sched = shiftSchedules.find(s => s.id === activeScheduleId)
  return `
    <div class="pl-sched-header">
      <button type="button" class="pl-sched-back" id="pl-sched-back" aria-label="Semua Jadwal" title="Semua Jadwal">${svgIcon('home').replace('<svg ', '<svg style="width:17px;height:17px" ')}</button>
      <div class="pl-sched-header-name">${esc(sched ? sched.name : '')}</div>
      <button type="button" id="pl-shift-settings-toggle" class="pl-sched-settings-btn" aria-label="Kelola Personil & Shift" title="Kelola Personil & Shift">${svgIcon('settings').replace('<svg ', '<svg class="pl-gear-spin" style="width:17px;height:17px" ')}</button>
    </div>
    ${!ready ? `
      <div class="empty">
        <div class="empty-icon">${USERS32}</div>
        <div class="empty-title">${shiftPersonnel.length === 0 ? 'Tambah personil dulu' : 'Atur jumlah shift dulu'}</div>
        <div class="empty-sub">Buka "Kelola Personil & Shift" di atas untuk mulai.</div>
      </div>
    ` : `
      <button type="button" class="pl-week-today-btn ${isCurrentWeek() ? 'pl-hidden' : ''}" id="pl-week-today">&lsaquo; Minggu ini</button>
      <div class="pl-period-card">
        <button class="pl-period-nav-btn" id="pl-week-prev" aria-label="Minggu sebelumnya">&lsaquo;</button>
        <div class="pl-period-center">
          <div class="pl-period-label">Periode</div>
          <div class="pl-period-range">${fmtWeekRange(shiftWeekStart)}</div>
        </div>
        <button class="pl-period-nav-btn" id="pl-week-next" aria-label="Minggu berikutnya">&rsaquo;</button>
      </div>
      <div class="pl-view-tabs">
        <button type="button" class="pl-view-tab ${!showByNameView && gridViewMode === 'old' ? 'active' : ''}" id="pl-tab-old">${svgIcon('pencil').replace('<svg ', '<svg style="width:13px;height:13px" ')} Hari</button>
        <button type="button" class="pl-view-tab ${!showByNameView && gridViewMode === 'new' ? 'active' : ''}" id="pl-tab-new">${svgIcon('pencil').replace('<svg ', '<svg style="width:13px;height:13px" ')} Shift</button>
        <button type="button" class="pl-view-tab ${showByNameView ? 'active' : ''}" id="pl-tab-byname">${svgIcon('eye').replace('<svg ', '<svg style="width:13px;height:13px" ')} Matriks</button>
      </div>
      <div class="pl-view-tabs-hint">Tampilan yang aktif ini yang dipakai saat Bagikan.</div>
      ${showByNameView ? renderShiftGridByName() : gridViewMode === 'new' ? renderShiftGridCards() : renderShiftGridOld()}
      <button type="button" id="pl-duplicate-btn" class="pl-settings-toggle" style="margin-top:14px;margin-bottom:8px">
        ${svgIcon('copy').replace('<svg ', '<svg style="width:15px;height:15px" ')}
        <span>Duplikat Jadwal Minggu Lalu</span>
      </button>
      <button type="button" id="pl-notes-btn" class="pl-settings-toggle" style="margin-top:0;margin-bottom:0">
        ${svgIcon('pencil').replace('<svg ', '<svg style="width:15px;height:15px" ')}
        <span>${shiftNoteText ? esc(shiftNoteText.length > 46 ? shiftNoteText.slice(0, 46) + '…' : shiftNoteText) : 'Tambah Catatan'}</span>
      </button>
      <button type="button" id="pl-share-btn" class="pl-fab pl-share-fab" aria-label="Bagikan Jadwal" title="Bagikan Jadwal" ${sharing ? 'disabled' : ''}>
        ${svgIcon('share').replace('<svg ', '<svg style="width:18px;height:18px" ')}
      </button>
      ${activeShiftCell ? '<div style="height:85vh"></div>' : ''}
    `}
    ${showShiftSettings ? renderShiftSettingsSheet(!ready) : ''}
    ${activeShiftCell ? renderShiftSheet() : ''}
    ${showShareSheet ? renderShareSheet() : ''}
    ${showNotesSheet ? renderNotesSheet() : ''}
  `
}

function wireScheduleDetail() {
  const ready = shiftPersonnel.length > 0 && shiftConfig && shiftConfig.shifts_per_day > 0
  app.querySelector('#pl-sched-back').addEventListener('click', () => { activeScheduleId = null; render() })
  app.querySelector('#pl-shift-settings-toggle').addEventListener('click', () => { showShiftSettings = true; render() })
  if (showShiftSettings) wireShiftSettingsSheet()
  if (ready) {
    app.querySelector('#pl-week-prev').addEventListener('click', async () => { shiftWeekAdd(-7); await loadWeekNote(); render() })
    app.querySelector('#pl-week-next').addEventListener('click', async () => { shiftWeekAdd(7); await loadWeekNote(); render() })
    const todayBtn = app.querySelector('#pl-week-today')
    if (todayBtn) todayBtn.addEventListener('click', async () => { shiftWeekStart = fmtYMD(mondayOfWeek(new Date())); await loadWeekNote(); render() })
    app.querySelectorAll('.pl-shift-cell, .pl-shift-row').forEach(cell => {
      cell.addEventListener('click', () => {
        activeShiftCell = { day: Number(cell.dataset.day), shift: Number(cell.dataset.shift) }
        render()
        // Tunggu 2 frame (double rAF) — pastiin DOM & layout (termasuk sheet-nya) udah beneran
        // ke-render dulu sebelum ukur posisi. Tanpa ini, perhitungan bisa kebaca sebelum
        // View Transition-nya kelar apply, jadi cell malah numpuk di atas sheet-nya sendiri.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = app.querySelector(`[data-day="${activeShiftCell.day}"][data-shift="${activeShiftCell.shift}"]`)
            if (el) {
              const rect = el.getBoundingClientRect()
              const targetY = window.scrollY + rect.top - 90
              window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' })
            }
          })
        })
      })
    })
    app.querySelector('#pl-duplicate-btn').addEventListener('click', duplicatePreviousWeek)
    app.querySelector('#pl-notes-btn').addEventListener('click', () => { showNotesSheet = true; render() })
    app.querySelector('#pl-share-btn').addEventListener('click', async () => {
      const hasAny = shiftAssignments.some(a => a.week_start === shiftWeekStart && (a.personnel_ids || []).length > 0)
      if (!hasAny && !(await customConfirm('Jadwal minggu ini masih kosong. Tetap lanjut bagikan?', { okLabel: 'Ya, Lanjut' }))) return
      showShareSheet = true; render()
    })
    app.querySelector('#pl-tab-old').addEventListener('click', () => { showByNameView = false; gridViewMode = 'old'; render() })
    app.querySelector('#pl-tab-new').addEventListener('click', () => { showByNameView = false; gridViewMode = 'new'; render() })
    app.querySelector('#pl-tab-byname').addEventListener('click', () => { showByNameView = true; render() })
  }
  if (activeShiftCell) wireShiftSheet()
  if (showShareSheet) wireShareSheet()
  if (showNotesSheet) wireNotesSheet()
}

// ══════════════════════════════════════════════════════════
// ── RENDER UTAMA ──
// ══════════════════════════════════════════════════════════

function render() {
  const doRender = () => {
    if (showLanding) {
      app.innerHTML = renderLanding()
      wireLanding()
      return
    }
    app.innerHTML = (activeScheduleId ? renderScheduleDetail() : renderScheduleHome()) + (confirmDialog ? renderConfirmDialog() : '')
    if (activeScheduleId) wireScheduleDetail(); else wireScheduleHome()
    if (confirmDialog) wireConfirmDialog()
  }
  // View Transitions API: kalau ada perubahan layout (misal tombol "Minggu ini" muncul/hilang,
  // konten di bawahnya jadi ke-push), browser animasiin bedanya secara otomatis — smooth,
  // bukan loncat instan. Fallback biasa kalau browser belum dukung.
  if (document.startViewTransition) {
    document.startViewTransition(doRender)
  } else {
    doRender()
  }
}

// Ganti pendekatan auto-select isi lama input: bukan pakai .select() (itu yang bikin toolbar
// Translate/Potong/Salin/Tempel native Android muncul), tapi kosongin otomatis pas huruf/angka
// pertama diketik setelah fokus — hasil akhirnya sama (langsung ganti), tapi gak ada seleksi teks.
function wireClearOnFirstKeystroke(inp) {
  inp.addEventListener('focus', e => { e.target.dataset.freshFocus = '1' })
  inp.addEventListener('keydown', e => {
    if (e.target.dataset.freshFocus !== '1') return
    delete e.target.dataset.freshFocus
    if (e.key.length === 1) e.target.value = '' // huruf/angka biasa -> kosongin dulu, biar browser lanjut insert normal
  })
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Pengganti window.confirm() bawaan browser — popup custom senada tema app.
// Pakai: if (!(await customConfirm('Yakin?'))) return
function customConfirm(message, { title = 'Konfirmasi', danger = false, okLabel } = {}) {
  return new Promise((resolve) => {
    confirmDialog = { title, message, danger, okLabel: okLabel || (danger ? 'Hapus' : 'Ya, Lanjut'), singleButton: false, resolve }
    render()
  })
}

// Pengganti window.alert() — cuma satu tombol Oke, resolve begitu ditekan.
function customAlert(message, { title = 'Perhatian', okLabel = 'Oke' } = {}) {
  return new Promise((resolve) => {
    confirmDialog = { title, message, danger: false, okLabel, singleButton: true, resolve }
    render()
  })
}

function renderConfirmDialog() {
  const { title, message, danger, okLabel, singleButton } = confirmDialog
  return `
    <div class="pl-overlay pl-overlay-center" id="pl-confirm-overlay">
      <div class="pl-sheet pl-sheet-center pl-confirm-sheet">
        <div class="pl-sheet-title">${esc(title)}</div>
        <div class="pl-confirm-message">${esc(message)}</div>
        <div class="pl-confirm-actions">
          ${singleButton ? '' : '<button type="button" class="pl-confirm-cancel" id="pl-confirm-cancel">Batal</button>'}
          <button type="button" class="pl-confirm-ok ${danger ? 'danger' : ''}" id="pl-confirm-ok">${esc(okLabel)}</button>
        </div>
      </div>
    </div>
  `
}

function wireConfirmDialog() {
  const overlay = app.querySelector('#pl-confirm-overlay')
  const finish = (result) => {
    const resolve = confirmDialog.resolve
    confirmDialog = null
    resolve(result)
    render()
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(confirmDialog.singleButton ? undefined : false) })
  const cancelBtn = app.querySelector('#pl-confirm-cancel')
  if (cancelBtn) cancelBtn.addEventListener('click', () => finish(false))
  app.querySelector('#pl-confirm-ok').addEventListener('click', () => finish(confirmDialog.singleButton ? undefined : true))
}

// Period card jadi floating/compact pas discroll ke bawah — listener sekali aja (bukan tiap render),
// query ulang tiap event scroll biar tetap kerja walau DOM-nya keganti tiap render() (no-op kalau lagi gak di halaman ini)
window.addEventListener('scroll', () => {
  const card = document.querySelector('.pl-period-card')
  if (!card) return
  if (window.scrollY > 40) card.classList.add('floating')
  else card.classList.remove('floating')
}, { passive: true })

// ── PWA: service worker (syarat teknis buat prompt Install) + tangkap beforeinstallprompt ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredInstallPrompt = e
  installAvailable = true
  render()
})
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null
  installAvailable = false
  render()
})

// ── Boot ──
;(async () => {
  await loadSchedules()
  render()
})()
