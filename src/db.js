// src/db.js — IndexedDB layer khusus data shift (dipisah dari belanja-app/planner)
const DB_NAME = 'myshift'
const DB_VER  = 1
let _db = null

export function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('shift_personnel'))
        db.createObjectStore('shift_personnel', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('shift_config'))
        db.createObjectStore('shift_config', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('shift_assignments')) {
        const psa = db.createObjectStore('shift_assignments', { keyPath: 'id' })
        psa.createIndex('week_start', 'week_start')
      }
    }
    r.onsuccess = () => { _db = r.result; res(_db) }
    r.onerror   = () => rej(r.error)
  })
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
