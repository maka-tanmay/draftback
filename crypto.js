(function (root) {
  "use strict";

  const DB_NAME = "draftback-keys";
  const STORE_NAME = "keys";
  const KEY_ID = "draft-key-v1";
  let keyPromise;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readKey(database) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(KEY_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function writeKey(database, key) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(key, KEY_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function loadKey() {
    const database = await openDatabase();
    try {
      let key = await readKey(database);
      if (!key) {
        key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        await writeKey(database, key);
      }
      return key;
    } finally {
      database.close();
    }
  }

  function getKey() {
    if (!keyPromise) keyPromise = loadKey().catch(error => { keyPromise = null; throw error; });
    return keyPromise;
  }

  function bytesToBase64(bytes) {
    let value = "";
    for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function encrypt(value) {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ciphertext)) };
  }

  async function decrypt(value) {
    const key = await getKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(value.iv) },
      key,
      base64ToBytes(value.data)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async function deleteKey() {
    if (keyPromise) await keyPromise;
    keyPromise = null;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Encryption key deletion was blocked."));
    });
  }

  root.DraftBackCrypto = { encrypt, decrypt, deleteKey };
})(globalThis);
