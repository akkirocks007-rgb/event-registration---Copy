/**
 * EventPro Offline Cache
 * ======================
 * IndexedDB wrapper for scanner offline resilience.
 *
 * - Caches attendees + staff passes per event for instant QR/NFC lookup
 * - Queues scan operations (checkpoints + scanLogs) when offline
 * - Flushes queue automatically when connectivity returns
 */

const DB_NAME = 'EventProScannerCache';
const DB_VERSION = 1;

const STORES = {
  attendees: 'attendees',
  staff: 'staff',
  scanQueue: 'scanQueue',
  metadata: 'metadata',
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Attendees: key = attendee id, index on eventId + email
      if (!db.objectStoreNames.contains(STORES.attendees)) {
        const store = db.createObjectStore(STORES.attendees, { keyPath: 'id' });
        store.createIndex('eventId', 'eventId', { unique: false });
        store.createIndex('email', 'email', { unique: false });
      }
      // Staff passes: key = staff id, index on email
      if (!db.objectStoreNames.contains(STORES.staff)) {
        const store = db.createObjectStore(STORES.staff, { keyPath: 'id' });
        store.createIndex('email', 'email', { unique: false });
      }
      // Scan operation queue: auto-increment key
      if (!db.objectStoreNames.contains(STORES.scanQueue)) {
        db.createObjectStore(STORES.scanQueue, { keyPath: 'localId', autoIncrement: true });
      }
      // Metadata: key = string key
      if (!db.objectStoreNames.contains(STORES.metadata)) {
        db.createObjectStore(STORES.metadata, { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

// ─── Generic CRUD ──────────────────────────────────────────────────────────

async function putAll(storeName, items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const idx = store.index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getByKey(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteByKey(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.metadata, 'readwrite');
    const store = tx.objectStore(STORES.metadata);
    store.put({ key, value, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.metadata, 'readonly');
    const store = tx.objectStore(STORES.metadata);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Cache all attendees for an event (call after supervisor selects event/gate) */
export async function cacheEventAttendees(eventId, attendees) {
  // Normalize email field for index consistency
  const normalized = attendees.map(a => ({
    ...a,
    eventId,
    email: a.primaryEmail || a.email || '',
    _cachedAt: new Date().toISOString(),
  }));
  await clearStore(STORES.attendees);
  await putAll(STORES.attendees, normalized);
  await setMeta('lastEventId', eventId);
  await setMeta('lastCacheTime', new Date().toISOString());
  // Attendees cached
}

/** Cache staff passes */
export async function cacheStaffPasses(staff) {
  const normalized = staff.map(s => ({
    ...s,
    email: s.email || '',
    _cachedAt: new Date().toISOString(),
  }));
  await clearStore(STORES.staff);
  await putAll(STORES.staff, normalized);
  // Staff passes cached
}

/** Load cached attendees for the current event */
export async function loadCachedAttendees(eventId) {
  if (!eventId) return [];
  return getByIndex(STORES.attendees, 'eventId', eventId);
}

/** Load all cached staff */
export async function loadCachedStaff() {
  return getAll(STORES.staff);
}

/** Look up a person by QR id or email across attendees + staff */
export async function lookupCachedPerson(scannedId, eventId) {
  // Try attendee by id
  let person = await getByKey(STORES.attendees, scannedId);
  if (person) return { ...person, _source: 'attendee' };

  // Try attendee by email
  if (eventId) {
    const byEmail = await getByIndex(STORES.attendees, 'email', scannedId);
    if (byEmail.length > 0) return { ...byEmail[0], _source: 'attendee' };
  }

  // Try staff by id
  person = await getByKey(STORES.staff, scannedId);
  if (person) return { ...person, _source: 'staff', isStaff: true };

  // Try staff by email
  const staffByEmail = await getByIndex(STORES.staff, 'email', scannedId);
  if (staffByEmail.length > 0) return { ...staffByEmail[0], _source: 'staff', isStaff: true };

  return null;
}

/** Get cache metadata */
export async function getCacheMeta() {
  return {
    lastEventId: await getMeta('lastEventId'),
    lastCacheTime: await getMeta('lastCacheTime'),
    queueSize: (await getAll(STORES.scanQueue)).length,
  };
}

/** Clear everything (e.g. on End Shift) */
export async function clearAllCache() {
  await clearStore(STORES.attendees);
  await clearStore(STORES.staff);
  await clearStore(STORES.scanQueue);
  await clearStore(STORES.metadata);
  dbPromise = null;
  // All cache cleared
}

// ─── Scan Operation Queue ──────────────────────────────────────────────────

/** Queue a scan operation for later sync (used when offline) */
export async function queueScanOperation(op) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.scanQueue, 'readwrite');
    const store = tx.objectStore(STORES.scanQueue);
    store.add({
      ...op,
      _queuedAt: new Date().toISOString(),
      attempts: 0,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all pending scan operations */
export async function getScanQueue() {
  return getAll(STORES.scanQueue);
}

/** Remove a successfully processed operation from the queue */
export async function removeFromQueue(localId) {
  return deleteByKey(STORES.scanQueue, localId);
}

/** Update attempt count on a failed operation */
export async function markQueueAttempt(localId, error) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.scanQueue, 'readwrite');
    const store = tx.objectStore(STORES.scanQueue);
    const req = store.get(localId);
    req.onsuccess = () => {
      const item = req.result;
      if (item) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = error?.message || String(error);
        store.put(item);
      }
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => reject(req.error);
  });
}
