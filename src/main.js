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
  const startStr = `${start.getDate()}${sameMonth ? '' : ' ' + MONTHS_ID[start.getMonth()].slice(0, 3)}`
  const endStr = `${end.getDate()} ${MONTHS_ID[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`
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

function renderLanding() {
  return `
    <div class="pl-landing">
      <div class="pl-landing-hero">
        <div class="pl-landing-icon"><img src="/myshift_splash.png" alt="MyShift" style="width:100%;height:100%;object-fit:cover;border-radius:50%" /></div>
        <div class="pl-landing-title">MyShift</div>
        <div class="pl-landing-sub">Atur jadwal shift tim kamu — kantor, ronda malam, apa aja — tanpa ribet. Semua rapi dalam satu genggaman.</div>
        <button type="button" class="pl-landing-cta" id="pl-landing-start">
          Mulai ${svgIcon('chevronDown').replace('<svg ', '<svg style="width:16px;height:16px;transform:rotate(-90deg)" ')}
        </button>
      </div>
      <div class="pl-landing-features">
        <div class="pl-feature-card"><span class="pl-feature-icon-badge">${svgIcon('usersRound').replace('<svg ', '<svg style="width:20px;height:20px" ')}</span><div class="pl-feature-card-title">Banyak Jadwal</div></div>
        <div class="pl-feature-card"><span class="pl-feature-icon-badge">${svgIcon('share').replace('<svg ', '<svg style="width:20px;height:20px" ')}</span><div class="pl-feature-card-title">Bagikan Sekali Tap</div></div>
        <div class="pl-feature-card"><span class="pl-feature-icon-badge">${svgIcon('download').replace('<svg ', '<svg style="width:20px;height:20px" ')}</span><div class="pl-feature-card-title">Backup Kapan Aja</div></div>
      </div>
      <div class="pl-faq">
        <div class="pl-faq-title">Pertanyaan Umum</div>
        ${FAQ_ITEMS.map((item, i) => `
          <div class="pl-faq-item">
            <button type="button" class="pl-faq-q ${openFaqIndex === i ? 'open' : ''}" data-i="${i}">
              <span>${esc(item.q)}</span>
              ${svgIcon('chevronDown').replace('<svg ', '<svg style="width:16px;height:16px" ')}
            </button>
            ${openFaqIndex === i ? `<div class="pl-faq-a">${esc(item.a)}</div>` : ''}
          </div>
        `).join('')}
      </div>
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

// ══════════════════════════════════════════════════════════
// ── HALAMAN DAFTAR JADWAL (home) ──
// ══════════════════════════════════════════════════════════

function renderScheduleHome() {
  return `
    <div class="pl-sched-intro">
      <div class="pl-sched-intro-title">Jadwal Shift</div>
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
            <button type="button" class="pl-sched-del" data-id="${s.id}" aria-label="Hapus jadwal">${svgIcon('closeIcon').replace('<svg ', '<svg style="width:13px;height:13px" ')}</button>
          </div>
        `).join('')}
      </div>
    `}
    <button type="button" class="pl-submit" id="pl-sched-add">+ Tambah Jadwal Shift</button>

    <div class="pl-backup-box">
      <div class="pl-backup-title">${svgIcon('download').replace('<svg ', '<svg style="width:15px;height:15px" ')} Backup &amp; Restore Data</div>
      <div class="pl-backup-hint">Data cuma tersimpan di perangkat ini. Backup rutin biar gak hilang kalau ganti HP atau cache browser kehapus.</div>
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

    ${showScheduleForm ? renderScheduleFormSheet() : ''}
  `
}

function wireScheduleHome() {
  app.querySelector('#pl-sched-add').addEventListener('click', () => { showScheduleForm = true; render() })
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
    alert('Belum berhasil terhubung ke Google Drive. Kalau tombol Backup/Restore belum muncul, tap "Hubungkan Google Drive" lagi.')
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
    alert(err.message || 'Gagal backup ke Drive.')
  } finally {
    driveBusy = false; render()
  }
}

async function driveRestoreNow() {
  if (driveBusy) return
  if (!confirm('Restore dari Drive akan MENGGANTI semua data yang ada sekarang (semua jadwal, personil, dan histori). Lanjutkan?')) return
  driveBusy = true; render()
  try {
    const result = await driveDownload()
    if (!result) {
      alert('Belum ada backup MyShift di Drive akun ini.')
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
    alert('Restore dari Drive berhasil!')
  } catch (err) {
    console.error(err)
    if (err.message && err.message.includes('Sesi Google Drive habis')) driveConnected = false
    alert(err.message || 'Gagal restore dari Drive.')
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
    <div class="pl-overlay" id="pl-sched-form-overlay">
      <div class="pl-sheet">
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
  if (!confirm(`Hapus jadwal "${name}"? Semua personil dan jadwal mingguan di dalamnya juga ikut terhapus.`)) return
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
    alert('File tidak valid. Pastikan file JSON hasil backup MyShift.')
    return
  }
  if (data.app !== 'myshift' || !Array.isArray(data.schedules)) {
    alert('File tidak valid. Pastikan file JSON hasil backup MyShift.')
    return
  }
  if (!confirm('Import akan MENGGANTI semua data yang ada sekarang (semua jadwal, personil, dan histori) dengan isi file ini. Lanjutkan?')) return
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
  alert('Import berhasil! Data sudah diganti sesuai file backup.')
  render()
}

// ══════════════════════════════════════════════════════════
// ── KELOLA PERSONIL & SHIFT (dalam satu jadwal) ──
// ══════════════════════════════════════════════════════════

function renderShiftSettingsSheet(onboarding) {
  const n = shiftConfig ? shiftConfig.shifts_per_day : 1
  const labels = shiftConfig ? shiftConfig.shift_labels : []
  return `
    <div class="pl-overlay" id="pl-shift-settings-overlay">
      <div class="pl-sheet">
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
            ${labels.map((l, i) => `<input type="text" class="pl-shift-label-input" data-i="${i}" value="${esc(l)}" placeholder="Nama shift ${i + 1}…" />`).join('')}
          </div>
        ` : ''}
        <button type="button" class="pl-submit" id="pl-shift-settings-done" style="margin-top:16px">Selesai</button>
      </div>
    </div>
  `
}

function wireShiftSettingsSheet() {
  const overlay = app.querySelector('#pl-shift-settings-overlay')
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { showShiftSettings = false; render() } })
  app.querySelector('#pl-shift-settings-done').addEventListener('click', () => { showShiftSettings = false; render() })
  const addPerson = async () => {
    const input = app.querySelector('#pl-person-input')
    const v = input.value.trim()
    if (!v) return
    await addShiftPersonnel(v)
  }
  app.querySelector('#pl-person-add').addEventListener('click', addPerson)
  app.querySelector('#pl-person-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } })
  app.querySelectorAll('.pl-person-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = shiftPersonnel.find(x => x.id === btn.dataset.id)
      const name = p ? p.name : 'personil ini'
      if (confirm(`Hapus ${name} dari daftar personil? Jadwal yang sudah diisi untuk orang ini juga akan dikosongkan.`)) {
        deleteShiftPersonnel(btn.dataset.id)
      }
    })
  })
  app.querySelector('#pl-shift-count').addEventListener('change', e => {
    updateShiftCount(Number(e.target.value) || 1)
  })
  app.querySelectorAll('.pl-shift-label-input').forEach(inp => {
    inp.addEventListener('change', e => {
      updateShiftLabel(Number(inp.dataset.i), e.target.value.trim())
    })
  })
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
  shiftConfig = { id: activeScheduleId, schedule_id: activeScheduleId, shifts_per_day: newCount, shift_labels: newLabels }
  await putLocal('shift_config', shiftConfig)
  render()
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
    const dayLabel = `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()].slice(0, 3)}`
    html += `<div class="pl-shift-day">
      <div class="pl-shift-day-label">${dayLabel}</div>
      <div class="pl-shift-cells">`
    for (let si = 0; si < n; si++) {
      const assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === di && a.shift_index === si)
      const people = (assign ? assign.personnel_ids : []).map(pid => shiftPersonnel.find(p => p.id === pid)).filter(Boolean)
      html += `<div class="pl-shift-cell" data-day="${di}" data-shift="${si}">
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
      const dayLabel = `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()].slice(0, 3)}`
      const assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === di && a.shift_index === si)
      const people = (assign ? assign.personnel_ids : []).map(pid => shiftPersonnel.find(p => p.id === pid)).filter(Boolean)
      html += `<div class="pl-shift-row" data-day="${di}" data-shift="${si}">
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
  const start = new Date(shiftWeekStart + 'T00:00:00')
  const today = fmtYMD(new Date())
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
        cellsHtml += `<td class="pl-shift-byname-cell pl-byname-leave">L</td>`
      } else if (si === -1) {
        cellsHtml += `<td class="pl-shift-byname-cell pl-byname-empty">–</td>`
      } else {
        const color = SHIFT_COLORS[si % SHIFT_COLORS.length]
        cellsHtml += `<td class="pl-shift-byname-cell" style="background:${color}22;color:${color};border-color:${color}55">${esc(codes[si])}</td>`
      }
    }
    rowsHtml += `<tr><td class="pl-shift-byname-name"><span class="pl-shift-dot" style="background:${p.color}"></span>${esc(p.name.split(' ')[0])}</td>${cellsHtml}</tr>`
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
  const legendItems = labels.slice(0, n).map((l, si) => {
    const label = l || `Shift ${si + 1}`
    const color = SHIFT_COLORS[si % SHIFT_COLORS.length]
    return `<span class="pl-byname-legend-item"><span class="pl-byname-legend-dot" style="background:${color}"></span>${esc(codes[si])} = ${esc(label)}</span>`
  }).join('')
  return `
    <div class="pl-shift-byname-wrap">
      <table class="pl-shift-byname-table">
        <thead><tr><th></th>${headerHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="pl-byname-legend">
      ${legendItems}
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
  if (prevAssignments.length === 0) { alert('Minggu sebelumnya belum ada jadwal yang bisa diduplikat.'); return }
  const hasCurrent = shiftAssignments.some(a => (a.personnel_ids || []).length > 0)
  if (hasCurrent && !confirm('Jadwal minggu ini sudah ada isinya. Timpa dengan jadwal minggu lalu?')) return
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

function buildExportCard() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const start = new Date(shiftWeekStart + 'T00:00:00')
  const sched = shiftSchedules.find(s => s.id === activeScheduleId)

  let daysHtml = ''
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
    daysHtml += `
      <div style="margin-bottom:14px">
        <div style="font-size:13.5px;font-weight:700;color:#1A1A1A;margin-bottom:4px">${dayLabel}</div>
        <div style="background:#FAFAF8;border:1px solid #EEEEEC;border-radius:12px;padding:4px 12px">${rowsHtml}</div>
      </div>`
  }

  const card = document.createElement('div')
  card.style.cssText = 'position:fixed;left:-9999px;top:0;width:720px;background:#ffffff;padding:32px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div style="font-size:22px;font-weight:800;color:#1A1A1A">${esc(sched ? sched.name : 'Jadwal Shift')}</div>
      <div style="font-size:13px;font-weight:700;color:#E11D48;background:#FFE4E6;padding:5px 12px;border-radius:999px">${fmtWeekRange(shiftWeekStart)}</div>
    </div>
    <div style="height:1px;background:#EEEEEC;margin:16px 0 20px"></div>
    ${shiftNoteText ? `<div style="background:#FFF8E1;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:#78350F;white-space:pre-wrap">${esc(shiftNoteText)}</div>` : ''}
    ${daysHtml}
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
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
    alert('Gagal membuat gambar. Coba lagi.')
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
    alert('Gagal membuat PDF. Coba lagi.')
  } finally {
    sharing = false; render()
  }
}

function renderShareSheet() {
  const sched = shiftSchedules.find(s => s.id === activeScheduleId)
  return `
    <div class="pl-overlay" id="pl-share-overlay">
      <div class="pl-sheet">
        <div class="pl-sheet-title">Bagikan ${esc(sched ? sched.name : 'Jadwal')} — ${fmtWeekRange(shiftWeekStart)}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button type="button" class="pl-share-opt" id="pl-share-jpg">
            ${svgIcon('image').replace('<svg ', '<svg style="width:18px;height:18px" ')}
            <span>Simpan sebagai JPG</span>
          </button>
          <button type="button" class="pl-share-opt" id="pl-share-pdf">
            ${svgIcon('fileText').replace('<svg ', '<svg style="width:18px;height:18px" ')}
            <span>Simpan sebagai PDF</span>
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
      <button type="button" class="pl-sched-back" id="pl-sched-back">&lsaquo; Semua Jadwal</button>
      <div class="pl-sched-header-name">${esc(sched ? sched.name : '')}</div>
    </div>
    <button id="pl-shift-settings-toggle" class="pl-settings-toggle">${svgIcon('wrench').replace('<svg ', '<svg style="width:15px;height:15px" ')} Kelola Personil & Shift</button>
    ${!ready ? `
      <div class="empty">
        <div class="empty-icon">${USERS32}</div>
        <div class="empty-title">${shiftPersonnel.length === 0 ? 'Tambah personil dulu' : 'Atur jumlah shift dulu'}</div>
        <div class="empty-sub">Buka "Kelola Personil & Shift" di atas untuk mulai.</div>
      </div>
    ` : `
      ${!isCurrentWeek() ? `<button type="button" class="pl-week-today-btn" id="pl-week-today">&lsaquo; Minggu ini</button>` : ''}
      <div class="pl-week-nav">
        <button class="pl-week-btn" id="pl-week-prev" aria-label="Minggu sebelumnya">&lsaquo;</button>
        <span class="pl-week-label">${fmtWeekRange(shiftWeekStart)}</span>
        <button class="pl-week-btn" id="pl-week-next" aria-label="Minggu berikutnya">&rsaquo;</button>
      </div>
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
      <button type="button" class="pl-fab pl-lihat-toggle ${showByNameView ? 'active' : ''}" id="pl-lihat-toggle" aria-label="Tampilan Lihat (ringkasan per nama)" title="Tampilan Lihat">
        ${svgIcon('eye').replace('<svg ', '<svg style="width:18px;height:18px" ')}
      </button>
      <button type="button" class="pl-fab pl-view-toggle" id="pl-edit-toggle" aria-label="Tampilan Edit — ganti layout grid" title="Tampilan Edit">
        ${svgIcon('swap').replace('<svg ', '<svg style="width:18px;height:18px" ')}
      </button>
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
      })
    })
    app.querySelector('#pl-duplicate-btn').addEventListener('click', duplicatePreviousWeek)
    app.querySelector('#pl-notes-btn').addEventListener('click', () => { showNotesSheet = true; render() })
    app.querySelector('#pl-share-btn').addEventListener('click', () => {
      const hasAny = shiftAssignments.some(a => a.week_start === shiftWeekStart && (a.personnel_ids || []).length > 0)
      if (!hasAny && !confirm('Jadwal minggu ini masih kosong. Tetap lanjut bagikan?')) return
      showShareSheet = true; render()
    })
    app.querySelector('#pl-edit-toggle').addEventListener('click', () => {
      if (showByNameView) { showByNameView = false } else { gridViewMode = gridViewMode === 'old' ? 'new' : 'old' }
      render()
    })
    app.querySelector('#pl-lihat-toggle').addEventListener('click', () => {
      showByNameView = true
      render()
    })
  }
  if (activeShiftCell) wireShiftSheet()
  if (showShareSheet) wireShareSheet()
  if (showNotesSheet) wireNotesSheet()
}

// ══════════════════════════════════════════════════════════
// ── RENDER UTAMA ──
// ══════════════════════════════════════════════════════════

function render() {
  if (showLanding) {
    app.innerHTML = renderLanding()
    wireLanding()
    return
  }
  app.innerHTML = activeScheduleId ? renderScheduleDetail() : renderScheduleHome()
  if (activeScheduleId) wireScheduleDetail(); else wireScheduleHome()
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ── Boot ──
;(async () => {
  await loadSchedules()
  render()
})()
