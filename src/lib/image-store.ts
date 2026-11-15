const database = 'meme-cv-images'
const store = 'images'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadImages(): Promise<Record<string, Blob>> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const result: Record<string, Blob> = {}
    const request = tx.objectStore(store).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      result[String(cursor.key)] = cursor.value as Blob
      cursor.continue()
    }
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function saveImage(id: string, image: Blob | null): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    if (image) tx.objectStore(store).put(image, id)
    else tx.objectStore(store).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
