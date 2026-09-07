"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../shared.js");

test("paths exclude queries and fragments and normalize unstable ids", () => {
  assert.equal(core.normalizePath("/applications/123456/edit?token=secret#answer"), "/applications/:id/edit");
  assert.equal(core.normalizePath("/draft/550e8400-e29b-41d4-a716-446655440000"), "/draft/:id");
});

test("fingerprints separate sites and fields", () => {
  const base = { origin: "https://one.example", pathname: "/apply/1234", formIdentity: "application", fieldIdentity: "essay", tag: "textarea", ordinal: 0 };
  assert.notEqual(core.fieldFingerprintSource(base), core.fieldFingerprintSource({ ...base, origin: "https://two.example" }));
  assert.notEqual(core.fieldFingerprintSource(base), core.fieldFingerprintSource({ ...base, fieldIdentity: "cover-letter", ordinal: 1 }));
});

test("short writing is ineligible for recovery", () => {
  assert.equal(core.isMateriallyShorter("", "a".repeat(119)), false);
  assert.equal(core.isMateriallyShorter("", "a".repeat(120)), true);
});

test("identical snapshots are not duplicated", () => {
  const first = core.mergeSnapshot({ versions: [] }, "a".repeat(120), 1_000, "one", false);
  const second = core.mergeSnapshot(first.payload, "a".repeat(120), 40_000, "two", false);
  assert.equal(second.changed, false);
  assert.equal(second.payload.versions.length, 1);
});

test("rapid changes update the latest version instead of growing history", () => {
  let payload = core.mergeSnapshot({ versions: [] }, "a".repeat(120), 1_000, "one", false).payload;
  payload = core.mergeSnapshot(payload, "b".repeat(120), 2_000, "two", false).payload;
  assert.equal(payload.versions.length, 1);
  assert.equal(payload.versions[0].text, "b".repeat(120));
  assert.equal(payload.versions[0].createdAt, 1_000);
});

test("durable history rotates at five materially changed versions", () => {
  let payload = { versions: [] };
  for (let index = 0; index < 7; index += 1) {
    payload = core.mergeSnapshot(payload, String.fromCharCode(97 + index).repeat(140), 1_000 + index * 31_000, `v${index}`, false).payload;
  }
  assert.equal(payload.versions.length, 5);
  assert.equal(payload.versions[0].id, "v6");
  assert.equal(payload.versions[4].id, "v2");
});

test("forced restore checkpoints preserve the current text", () => {
  const original = core.mergeSnapshot({ versions: [] }, "original ".repeat(20), 1_000, "one", false).payload;
  const checkpoint = core.mergeSnapshot(original, "current ".repeat(20), 2_000, "two", true).payload;
  assert.equal(checkpoint.versions.length, 2);
  assert.equal(checkpoint.versions[0].id, "two");
});

test("word counts tolerate whitespace", () => {
  assert.equal(core.wordCount("  one\n two\tthree  "), 3);
  assert.equal(core.wordCount(""), 0);
});
