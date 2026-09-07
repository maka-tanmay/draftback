"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.DraftBackCore = require("../shared.js");
const memory = {};
let keyDeleted = false;

global.chrome = {
  storage: {
    local: {
      async get(key) {
        if (typeof key === "string") return { [key]: memory[key] };
        return { ...memory };
      },
      async set(values) { Object.assign(memory, values); },
      async remove(key) { delete memory[key]; },
      async getBytesInUse(key) { return new TextEncoder().encode(JSON.stringify(memory[key] || {})).byteLength; }
    }
  }
};

global.DraftBackCrypto = {
  async encrypt(value) { return { testCiphertext: JSON.stringify(value) }; },
  async decrypt(value) { return JSON.parse(value.testCiphertext); },
  async deleteKey() { keyDeleted = true; }
};

require("../store-runtime.js");

function details(overrides = {}) {
  return {
    fingerprint: "field-one",
    origin: "https://one.example",
    pathPattern: "/apply/:id",
    confidence: "exact",
    text: "word ".repeat(30),
    versionId: "v1",
    now: 1_000,
    ...overrides
  };
}

test.beforeEach(async () => {
  delete memory.draftRecords;
  keyDeleted = false;
});

test("snapshots are encrypted before local storage and identical saves do not duplicate", async () => {
  await DraftBackStore.saveSnapshot(details());
  const raw = memory.draftRecords["field-one"];
  assert.equal(raw.text, undefined);
  assert.equal(raw.versions, undefined);
  assert(raw.encrypted.testCiphertext);

  const duplicate = await DraftBackStore.saveSnapshot(details({ now: 40_000, versionId: "v2" }));
  assert.equal(duplicate.saved, false);
  assert.equal(duplicate.record.versions.length, 1);
});

test("five-version rotation and site separation survive storage round trips", async () => {
  const now = Date.now();
  for (let index = 0; index < 7; index += 1) {
    await DraftBackStore.saveSnapshot(details({
      text: String.fromCharCode(97 + index).repeat(140),
      versionId: `v${index}`,
      now: now + index * 31_000
    }));
  }
  await DraftBackStore.saveSnapshot(details({ fingerprint: "other-site", origin: "https://two.example", versionId: "other", now: now + 250_000 }));
  const one = await DraftBackStore.listSite("https://one.example");
  const two = await DraftBackStore.listSite("https://two.example");
  assert.equal(one.length, 1);
  assert.equal(one[0].versions.length, 5);
  assert.equal(two.length, 1);
  assert.equal(two[0].fingerprint, "other-site");
});

test("expiry cleanup removes stale records and keeps current records", async () => {
  const now = Date.now();
  await DraftBackStore.saveSnapshot(details({ now, fingerprint: "current" }));
  await DraftBackStore.saveSnapshot(details({ now, fingerprint: "expired" }));
  memory.draftRecords.expired.expiresAt = now - 1;
  const removed = await DraftBackStore.clearExpired();
  assert.equal(removed, 1);
  assert(memory.draftRecords.current);
  assert.equal(memory.draftRecords.expired, undefined);
});

test("the 5 MB ceiling evicts the oldest valid unpinned record", async () => {
  const now = Date.now();
  await DraftBackStore.saveSnapshot(details({ fingerprint: "old", text: "a".repeat(3_000_000), now }));
  await DraftBackStore.saveSnapshot(details({ fingerprint: "new", text: "b".repeat(3_000_000), now: now + 31_000 }));
  assert.equal(memory.draftRecords.old, undefined);
  assert(memory.draftRecords.new);
});

test("submit marking retains the record and records no success claim", async () => {
  await DraftBackStore.saveSnapshot(details({ now: Date.now() }));
  assert.equal(await DraftBackStore.markSubmitted("field-one"), true);
  const record = await DraftBackStore.getRecord("field-one");
  assert.equal(typeof record.submittedAt, "number");
  assert(record.expiresAt > record.submittedAt);
});

test("site deletion is scoped and delete-all also removes the key", async () => {
  const now = Date.now();
  await DraftBackStore.saveSnapshot(details({ now }));
  await DraftBackStore.saveSnapshot(details({ fingerprint: "field-two", origin: "https://two.example", now }));
  assert.equal(await DraftBackStore.clearSite("https://one.example"), 1);
  assert(memory.draftRecords["field-two"]);
  await DraftBackStore.clearAll();
  assert.equal(memory.draftRecords, undefined);
  assert.equal(keyDeleted, true);
});

test("site listing and deletion follow browser host permissions across ports", async () => {
  const now = Date.now();
  await DraftBackStore.saveSnapshot(details({
    fingerprint: "local-port-one",
    origin: "http://127.0.0.1:8765",
    now
  }));
  await DraftBackStore.saveSnapshot(details({
    fingerprint: "local-port-two",
    origin: "http://127.0.0.1:9999",
    now
  }));
  assert.equal((await DraftBackStore.listSite("http://127.0.0.1")).length, 2);
  assert.equal(await DraftBackStore.clearSite("http://127.0.0.1"), 2);
});
