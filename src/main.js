import './viewport.js'
import { svgIcon } from './icons.js'
import { getAllLocal, putLocal, deleteLocal } from './db.js'

const USERS32 = svgIcon('usersRound').replace('<svg ', '<svg style="width:32px;height:32px" ')

const DAYS_ID   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const app = document.getElementById('app')

// ── State ──
const SHIFT_COLORS = ['#E11D48','#EA580C','#D97706','#65A30D','#059669','#0891B2','#2563EB','#7C3AED','#C026D3','#DB2777']
let shiftPersonnel = [], shiftConfig = null, shiftAssignments = []
let showShiftSettings = false
let shiftWeekStart = fmtYMD(mondayOfWeek(new Date()))
let activeShiftCell = null   // { day, shift } saat sheet assign personil terbuka
let showShareSheet = false
let sharing = false          // lagi generate JPG/PDF (disable tombol biar gak double-tap)

// ── Load ──
async function loadShiftData() {
  shiftPersonnel = await getAllLocal('shift_personnel')
  const configs = await getAllLocal('shift_config')
  shiftConfig = configs.find(c => c.id === 'default') || null
  shiftAssignments = await getAllLocal('shift_assignments')
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

function findOtherShiftSameDay(pid, day, currentShiftIdx) {
  const a = shiftAssignments.find(x => x.week_start === shiftWeekStart && x.day_index === day && x.shift_index !== currentShiftIdx && (x.personnel_ids || []).includes(pid))
  if (!a) return null
  return shiftConfig.shift_labels[a.shift_index] || `Shift ${a.shift_index + 1}`
}

function renderShiftSettingsPanel() {
  const n = shiftConfig ? shiftConfig.shifts_per_day : 1
  const labels = shiftConfig ? shiftConfig.shift_labels : []
  return `
    <div class="pl-shift-settings">
      <div class="pl-proj-detail-label">Personil</div>
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

      <div class="pl-proj-detail-label" style="margin-top:16px">Jumlah shift per hari</div>
      <div class="pl-shift-count-row">
        <input id="pl-shift-count" type="number" min="1" max="8" value="${n}" />
        <span class="pl-list-empty" style="padding:0">tiap hari dibagi rata</span>
      </div>
      ${shiftConfig ? `
        <div class="pl-shift-labels">
          ${labels.map((l, i) => `<input type="text" class="pl-shift-label-input" data-i="${i}" value="${esc(l)}" placeholder="Nama shift ${i + 1}…" />`).join('')}
        </div>
      ` : ''}
    </div>
  `
}

function wireShiftSettings() {
  const addPerson = async () => {
    const input = app.querySelector('#pl-person-input')
    const v = input.value.trim()
    if (!v) return
    await addShiftPersonnel(v)
  }
  app.querySelector('#pl-person-add').addEventListener('click', addPerson)
  app.querySelector('#pl-person-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } })
  app.querySelectorAll('.pl-person-del').forEach(btn => {
    btn.addEventListener('click', () => deleteShiftPersonnel(btn.dataset.id))
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
  await putLocal('shift_personnel', { id: crypto.randomUUID(), name, color, created_at: Date.now() })
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
  await loadShiftData()
  render()
}

async function updateShiftCount(newCount) {
  newCount = Math.max(1, Math.min(8, newCount))
  const oldLabels = shiftConfig ? shiftConfig.shift_labels : []
  const newLabels = Array.from({ length: newCount }, (_, i) => oldLabels[i] || `Shift ${i + 1}`)
  shiftConfig = { id: 'default', shifts_per_day: newCount, shift_labels: newLabels }
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

function renderShiftGrid() {
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
          ? '<div class="pl-shift-cell-empty">+ isi</div>'
          : `<div class="pl-shift-cell-people">${people.map(p => `<span class="pl-shift-chip" style="border-color:${p.color};background:${p.color}22"><span class="pl-shift-dot" style="background:${p.color}"></span>${esc(p.name.split(' ')[0])}</span>`).join('')}</div>`}
      </div>`
    }
    html += `</div></div>`
  }
  return html
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
        <div class="pl-sheet-chips">
          ${shiftPersonnel.map(p => {
            const checked = assignedIds.includes(p.id)
            const other = findOtherShiftSameDay(p.id, day, shift)
            return `<button type="button" class="pl-sheet-chip ${checked ? 'checked' : ''}" data-pid="${p.id}" style="border-color:${p.color};${checked ? `background:${p.color}` : ''}">
              <span class="pl-shift-dot" style="background:${checked ? '#fff' : p.color}"></span>${esc(p.name)}${other ? `<span class="pl-sheet-conflict">· sudah di ${esc(other)}</span>` : ''}
            </button>`
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
}

async function toggleShiftAssign(pid) {
  const { day, shift } = activeShiftCell
  let assign = shiftAssignments.find(a => a.week_start === shiftWeekStart && a.day_index === day && a.shift_index === shift)
  if (!assign) assign = { id: crypto.randomUUID(), week_start: shiftWeekStart, day_index: day, shift_index: shift, personnel_ids: [] }
  const idx = assign.personnel_ids.indexOf(pid)
  if (idx === -1) assign.personnel_ids.push(pid); else assign.personnel_ids.splice(idx, 1)
  assign.updated_at = Date.now()
  await putLocal('shift_assignments', assign)
  await loadShiftData()
  render()
}

// ══════════════════════════════════════════════════════════
// ── EKSPOR / BAGIKAN (JPG & PDF) ──
// ══════════════════════════════════════════════════════════

function buildExportCard() {
  const n = shiftConfig.shifts_per_day
  const labels = shiftConfig.shift_labels
  const start = new Date(shiftWeekStart + 'T00:00:00')

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
      <div style="font-size:22px;font-weight:800;color:#1A1A1A">Jadwal Shift</div>
      <div style="font-size:13px;font-weight:700;color:#E11D48;background:#FFE4E6;padding:5px 12px;border-radius:999px">${fmtWeekRange(shiftWeekStart)}</div>
    </div>
    <div style="height:1px;background:#EEEEEC;margin:16px 0 20px"></div>
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
  return `jadwal-shift-${shiftWeekStart}.${ext}`
}

async function shareFileOrDownload(blob, filename, mime) {
  const file = new File([blob], filename, { type: mime })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Jadwal Shift' })
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
  return `
    <div class="pl-overlay" id="pl-share-overlay">
      <div class="pl-sheet">
        <div class="pl-sheet-title">Bagikan Jadwal — ${fmtWeekRange(shiftWeekStart)}</div>
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

function render() {
  const ready = shiftPersonnel.length > 0 && shiftConfig && shiftConfig.shifts_per_day > 0
  app.innerHTML = `
    <button id="pl-shift-settings-toggle" class="pl-settings-toggle">${svgIcon('wrench').replace('<svg ', '<svg style="width:15px;height:15px" ')} ${showShiftSettings ? 'Tutup Pengaturan' : 'Kelola Personil & Shift'}</button>
    ${showShiftSettings ? renderShiftSettingsPanel() : ''}
    ${!ready ? `
      <div class="empty">
        <div class="empty-icon">${USERS32}</div>
        <div class="empty-title">${shiftPersonnel.length === 0 ? 'Tambah personil dulu' : 'Atur jumlah shift dulu'}</div>
        <div class="empty-sub">Buka "Kelola Personil & Shift" di atas untuk mulai.</div>
      </div>
    ` : `
      <div class="pl-week-nav">
        <button class="pl-week-btn" id="pl-week-prev" aria-label="Minggu sebelumnya">&lsaquo;</button>
        <span class="pl-week-label">${fmtWeekRange(shiftWeekStart)}</span>
        <button class="pl-week-btn" id="pl-week-next" aria-label="Minggu berikutnya">&rsaquo;</button>
      </div>
      ${renderShiftGrid()}
      <button type="button" id="pl-share-btn" class="pl-submit" style="margin-top:14px;display:flex;align-items:center;justify-content:center;gap:7px" ${sharing ? 'disabled' : ''}>
        ${svgIcon('share').replace('<svg ', '<svg style="width:15px;height:15px" ')} ${sharing ? 'Membuat file…' : 'Bagikan Jadwal'}
      </button>
    `}
    ${activeShiftCell ? renderShiftSheet() : ''}
    ${showShareSheet ? renderShareSheet() : ''}
  `
  app.querySelector('#pl-shift-settings-toggle').addEventListener('click', () => { showShiftSettings = !showShiftSettings; render() })
  if (showShiftSettings) wireShiftSettings()
  if (ready) {
    app.querySelector('#pl-week-prev').addEventListener('click', () => { shiftWeekAdd(-7); render() })
    app.querySelector('#pl-week-next').addEventListener('click', () => { shiftWeekAdd(7); render() })
    app.querySelectorAll('.pl-shift-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        activeShiftCell = { day: Number(cell.dataset.day), shift: Number(cell.dataset.shift) }
        render()
      })
    })
    app.querySelector('#pl-share-btn').addEventListener('click', () => { showShareSheet = true; render() })
  }
  if (activeShiftCell) wireShiftSheet()
  if (showShareSheet) wireShareSheet()
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ── Boot ──
;(async () => {
  await loadShiftData()
  render()
})()
