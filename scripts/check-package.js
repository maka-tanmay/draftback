"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const runtimeScripts = ["background.js", "content.js", "recovery-core.js", "recovery.js", "crypto.js", "store-runtime.js", "shared.js", "popup.js", "settings.js", "onboarding.js", "autofill.js", "autofill-page.js", "profile.js"];
const pages = ["popup.html", "settings.html", "onboarding.html", "privacy.html", "profile.html"];

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.host_permissions, undefined, "Website access must not be installed by default.");
assert.equal(manifest.content_scripts, undefined, "Content scripts must be registered only after permission.");
assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
assert(!manifest.permissions.includes("tabs"));
assert(!manifest.permissions.includes("webRequest"));
assert.equal(manifest.version, "0.7.1");
assert.equal(manifest.version, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
for (const size of [16, 32, 48, 128]) {
  assert(existsSync(join(root, manifest.icons[String(size)])), `Missing ${size}px extension icon.`);
}

for (const filename of runtimeScripts) {
  execFileSync(process.execPath, ["--check", join(root, filename)], { stdio: "pipe" });
  const source = readFileSync(join(root, filename), "utf8");
  assert(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(source), `${filename} contains a network API.`);
  assert(!/https?:\/\//.test(source), `${filename} contains a remote URL.`);
}

for (const filename of pages) {
  const source = readFileSync(join(root, filename), "utf8");
  assert(!/<script[^>]+src=["']https?:/i.test(source), `${filename} contains a remote script.`);
  assert(!/<script(?![^>]+src=)[^>]*>/i.test(source), `${filename} contains an inline script blocked by extension CSP.`);
}

console.log("Manifest, syntax, local-only runtime, and extension CSP checks passed.");
