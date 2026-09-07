(function (root) {
  "use strict";

  const RECORDS_KEY = "draftRecords";
  let mutationQueue = Promise.resolve();

  function mutate(operation) {
    const next = mutationQueue.then(operation, operation);
    mutationQueue = next.catch(() => {});
    return next;
  }

  async function loadRecords() {
    return (await chrome.storage.local.get(RECORDS_KEY))[RECORDS_KEY] || {};
  }

  async function writeRecords(records) {
    await chrome.storage.local.set({ [RECORDS_KEY]: records });
  }

  function encodedSize(records) {
    return new TextEncoder().encode(JSON.stringify(records)).byteLength;
  }

  function removeExpired(records, now) {
    let removed = 0;
    for (const [key, record] of Object.entries(records)) {
      if (record.expiresAt <= now) {
        delete records[key];
        removed += 1;
      }
    }
    return removed;
  }

  function enforceCeiling(records, protectedKey) {
    if (encodedSize(records) <= DraftBackCore.STORAGE_LIMIT_BYTES) return;
    const candidates = Object.entries(records)
      .filter(([key, record]) => key !== protectedKey && !record.pinned)
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (const [key] of candidates) {
      delete records[key];
      if (encodedSize(records) <= DraftBackCore.STORAGE_LIMIT_BYTES) return;
    }
    if (encodedSize(records) > DraftBackCore.STORAGE_LIMIT_BYTES) {
      throw new Error("DraftBack's 5 MB local storage limit was reached.");
    }
  }

  async function saveSnapshot(details) {
    return mutate(async () => {
      const now = details.now || Date.now();
      const records = await loadRecords();
      removeExpired(records, now);
      const existing = records[details.fingerprint];
      let payload = existing ? await DraftBackCrypto.decrypt(existing.encrypted) : { versions: [] };
      const merged = DraftBackCore.mergeSnapshot(
        payload,
        details.text,
        now,
        details.versionId,
        Boolean(details.forceVersion)
      );
      if (!merged.changed) return { saved: false, record: await publicRecord(existing, payload) };

      payload = merged.payload;
      const encrypted = await DraftBackCrypto.encrypt(payload);
      records[details.fingerprint] = {
        fingerprint: details.fingerprint,
        origin: details.origin,
        pathPattern: details.pathPattern,
        confidence: details.confidence,
        updatedAt: now,
        expiresAt: now + DraftBackCore.DAY_MS,
        submittedAt: existing?.submittedAt || null,
        pinned: false,
        encrypted
      };
      enforceCeiling(records, details.fingerprint);
      await writeRecords(records);
      return { saved: true, record: await publicRecord(records[details.fingerprint], payload) };
    });
  }

  async function publicRecord(record, knownPayload) {
    if (!record) return null;
    const payload = knownPayload || await DraftBackCrypto.decrypt(record.encrypted);
    return {
      fingerprint: record.fingerprint,
      origin: record.origin,
      pathPattern: record.pathPattern,
      confidence: record.confidence,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      submittedAt: record.submittedAt,
      versions: payload.versions
    };
  }

  async function getRecord(fingerprint) {
    const records = await loadRecords();
    const record = records[fingerprint];
    if (!record || record.expiresAt <= Date.now()) return null;
    return publicRecord(record);
  }

  async function listSite(origin) {
    const records = await loadRecords();
    const result = [];
    for (const record of Object.values(records)) {
      if (DraftBackCore.originPattern(record.origin) === DraftBackCore.originPattern(origin) && record.expiresAt > Date.now()) {
        result.push(await publicRecord(record));
      }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function deleteRecord(fingerprint) {
    return mutate(async () => {
      const records = await loadRecords();
      const existed = Boolean(records[fingerprint]);
      delete records[fingerprint];
      await writeRecords(records);
      return existed;
    });
  }

  async function clearSite(origin) {
    return mutate(async () => {
      const records = await loadRecords();
      let removed = 0;
      for (const [key, record] of Object.entries(records)) {
        if (DraftBackCore.originPattern(record.origin) === DraftBackCore.originPattern(origin)) {
          delete records[key];
          removed += 1;
        }
      }
      await writeRecords(records);
      return removed;
    });
  }

  async function clearExpired() {
    return mutate(async () => {
      const records = await loadRecords();
      const removed = removeExpired(records, Date.now());
      if (removed) await writeRecords(records);
      return removed;
    });
  }

  async function markSubmitted(fingerprint) {
    return mutate(async () => {
      const records = await loadRecords();
      if (!records[fingerprint]) return false;
      records[fingerprint].submittedAt = Date.now();
      await writeRecords(records);
      return true;
    });
  }

  async function clearAll() {
    return mutate(async () => {
      await chrome.storage.local.remove(RECORDS_KEY);
      await DraftBackCrypto.deleteKey();
      return true;
    });
  }

  async function stats() {
    const records = await loadRecords();
    const valid = Object.values(records).filter((record) => record.expiresAt > Date.now());
    return {
      records: valid.length,
      sites: new Set(valid.map((record) => record.origin)).size,
      bytes: await chrome.storage.local.getBytesInUse(RECORDS_KEY)
    };
  }

  root.DraftBackStore = {
    saveSnapshot,
    getRecord,
    listSite,
    deleteRecord,
    clearSite,
    clearExpired,
    markSubmitted,
    clearAll,
    stats
  };
})(globalThis);
