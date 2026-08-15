// src/db.js — IndexedDB layer khusus data shift (dipisah dari belanja-app/planner)
const DB_NAME = 'myshift'
const DB_VER  = 3
let _db = null

export function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER)
    r.onupgradeneeded = (event) => {
      const db = r.result
      const tx = event.target.transaction
      if (!db.objectStoreNames.contains('shift_schedules'))
        db.createObjectStore('shift_schedules', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('shift_notes'))
        db.createObjectStore('shift_notes', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('shift_personnel'))
        db.createObjectStore('shift_personnel', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('shift_config'))
        db.createObjectStore('shift_config', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('shift_assignments')) {
        const psa = db.createObjectStore('shift_assignments', { keyPath: 'id' })
        psa.createIndex('week_start', 'week_start')
      }
      // Migrasi data lama (satu jadwal tunggal, sebelum ada multi-jadwal) ke jadwal "legacy"
      if (event.oldVersion < 2) {
        const configStore = tx.objectStore('shift_config')
        configStore.get('default').onsuccess = (e) => {
          const oldConfig = e.target.result
          if (!oldConfig) return
          tx.objectStore('shift_schedules').put({ id: 'legacy', name: 'Jadwal Utama', color: '#374151', created_at: Date.now() })
          configStore.delete('default')
          configStore.put({ id: 'legacy', schedule_id: 'legacy', shifts_per_day: oldConfig.shifts_per_day, shift_labels: oldConfig.shift_labels })
          migrateStoreToLegacy(tx.objectStore('shift_personnel'))
          migrateStoreToLegacy(tx.objectStore('shift_assignments'))
        }
      }
    }
    r.onsuccess = () => { _db = r.result; res(_db) }
    r.onerror   = () => rej(r.error)
  })
}

function migrateStoreToLegacy(store) {
  store.openCursor().onsuccess = (e) => {
    const cursor = e.target.result
    if (!cursor) return
    const rec = cursor.value
    if (!rec.schedule_id) {
      rec.schedule_id = 'legacy'
      cursor.update(rec)
    }
    cursor.continue()
  }
}

export async function getAllLocal(storeName) {
  await openDB()
  return idbAll(storeName)
}

export async function putLocal(storeName, item) {
  await openDB()
  return new Promise((res, rej) => {
    const r = store(storeName, 'readwrite').put(item)
    r.onsuccess = () => res(item)
    r.onerror   = () => rej(r.error)
  })
}

export async function deleteLocal(storeName, id) {
  await openDB()
  return new Promise((res, rej) => {
    const r = store(storeName, 'readwrite').delete(id)
    r.onsuccess = () => res()
    r.onerror   = () => rej(r.error)
  })
}

function store(name, mode) {
  return _db.transaction(name, mode).objectStore(name)
}

function idbAll(storeName) {
  return new Promise((res, rej) => {
    const r = store(storeName, 'readonly').getAll()
    r.onsuccess = () => res(r.result || [])
    r.onerror   = () => rej(r.error)
  })
}
