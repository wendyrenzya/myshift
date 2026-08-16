// src/drive.js — backup/restore ke Google Drive milik user (opsional, tanpa backend)
// Pakai Google Identity Services (GIS) buat sign-in, lalu REST API Drive langsung via fetch (gak perlu gapi client, biar bundle tetap kecil).
// Scope drive.file: app CUMA bisa akses file yang dia sendiri buat/buka — gak bisa lihat file lain di Drive user.
//
// PENTING: karena app ini no-backend, access token dari GIS cuma hidup ~1 jam dan TIDAK ada refresh token
// (refresh token butuh client secret yang harus disimpan aman di server). Jadi user perlu sign-in ulang
// tiap sesi baru kalau mau backup/restore ke Drive — ini batasan arsitektur, bukan bug.

export const GOOGLE_CLIENT_ID = '730975818145-ilneubp7r63q8dboqtsi0heji4n574bc.apps.googleusercontent.com'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const BACKUP_FILENAME = 'myshift-backup.json'

let tokenClient = null
let accessToken = null

// Promise di-cache biar script GIS cuma di-append sekali, dan biar hasil preload di bawah bisa dipakai ulang oleh driveSignIn().
let gisLoadPromise = null
function loadGis() {
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisLoadPromise = null // biar bisa dicoba lagi nanti (misal koneksi tadi putus)
      reject(new Error('Gagal memuat Google Identity Services. Cek koneksi internet.'))
    }
    document.head.appendChild(s)
  })
  return gisLoadPromise
}

export function driveIsConfigured() {
  return !GOOGLE_CLIENT_ID.startsWith('GANTI_DENGAN_')
}

// Preload script GIS di background begitu app dibuka (bukan nunggu tombol "Hubungkan" ditap).
// Tanpa ini, tap pertama masih nunggu network fetch script dulu sebelum bisa buka popup —
// jeda itu bikin sebagian browser (terutama Chrome Android) nganggep popup-nya bukan hasil
// langsung dari gesture user, jadi keblokir popup blocker. Gagal preload didiemin aja;
// driveSignIn() bakal coba lagi pas user beneran tap, dan errornya baru muncul di situ.
if (driveIsConfigured()) loadGis().catch(() => {})

export function driveIsSignedIn() {
  return !!accessToken
}

export async function driveSignIn() {
  if (!driveIsConfigured()) throw new Error('Google Client ID belum diisi di src/drive.js')
  await loadGis()
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error))
        accessToken = resp.access_token
        resolve(accessToken)
      },
      error_callback: (err) => reject(new Error(err?.message || 'Sign-in dibatalkan atau gagal')),
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

export function driveSignOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {})
  }
  accessToken = null
  tokenClient = null
}

async function driveFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) {
    accessToken = null
    throw new Error('Sesi Google Drive habis, sign-in lagi ya.')
  }
  return res
}

async function findBackupFile() {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`)
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)`)
  if (!res.ok) throw new Error('Gagal cek file backup di Drive')
  const data = await res.json()
  return (data.files && data.files[0]) || null
}

// Upload/timpa backup JSON ke Drive. Return waktu tersimpan (ISO string).
export async function driveUpload(jsonText) {
  const existing = await findBackupFile()
  const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', new Blob([jsonText], { type: 'application/json' }))
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=modifiedTime`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=modifiedTime`
  const res = await driveFetch(url, { method: existing ? 'PATCH' : 'POST', body: form })
  if (!res.ok) throw new Error('Gagal upload backup ke Drive')
  const data = await res.json()
  return data.modifiedTime
}

// Ambil isi backup dari Drive. Return null kalau belum pernah backup ke Drive sebelumnya.
export async function driveDownload() {
  const existing = await findBackupFile()
  if (!existing) return null
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`)
  if (!res.ok) throw new Error('Gagal ambil backup dari Drive')
  return { text: await res.text(), modifiedTime: existing.modifiedTime }
}
