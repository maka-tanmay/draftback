(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const VERSION_INTERVAL_MS = 30 * 1000;
  const MIN_CHARACTERS = 120;
  const MAX_VERSIONS = 5;
  const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

  function normalizePath(pathname) {
    const clean = (pathname || "/").split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/");
    return clean
      .split("/")
      .map((part) => {
        if (/^\d{3,}$/.test(part)) return ":id";
        if (/^[0-9a-f]{8,}$/i.test(part)) return ":id";
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part)) return ":id";
        return part;
      })
      .join("/") || "/";
  }

  function originPattern(origin) {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("DraftBack supports only HTTP and HTTPS sites.");
    }
    return `${url.protocol}//${url.hostname}/*`;
  }

  function fieldFingerprintSource(parts) {
    return [
      parts.origin,
      normalizePath(parts.pathname),
      parts.formIdentity || "form:none",
      parts.fieldIdentity || "field:none",
      parts.tag || "unknown",
      String(parts.ordinal ?? 0)
    ].join("\u001f");
  }

  function wordCount(text) {
    const value = String(text || "").trim();
    return value ? value.split(/\s+/u).length : 0;
  }

  function isMateriallyShorter(current, saved) {
    const currentLength = String(current || "").trim().length;
    const savedLength = String(saved || "").trim().length;
    if (savedLength < MIN_CHARACTERS) return false;
    if (currentLength === 0) return true;
    return savedLength - currentLength >= 60 && currentLength / savedLength < 0.7;
  }

  function changedSpan(a, b) {
    const before = String(a || "");
    const after = String(b || "");
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) suffix += 1;
    return Math.max(before.length - prefix - suffix, after.length - prefix - suffix);
  }

  function isMateriallyDifferent(a, b) {
    if (a === b) return false;
    const largest = Math.max(String(a || "").length, String(b || "").length, 1);
    const changed = changedSpan(a, b);
    return changed >= 24 || changed / largest >= 0.05;
  }

  function makeVersion(text, now, id) {
    return {
      id,
      text,
      savedAt: now,
      createdAt: now,
      words: wordCount(text)
    };
  }

  function mergeSnapshot(payload, text, now, id, forceVersion) {
    const versions = [...(payload?.versions || [])];
    const latest = versions[0];
    if (latest?.text === text) return { changed: false, payload: payload || { versions: [] } };

    const next = makeVersion(text, now, id);
    const createVersion = !latest || forceVersion || (
      now - latest.createdAt >= VERSION_INTERVAL_MS && isMateriallyDifferent(latest.text, text)
    );
    if (createVersion) versions.unshift(next);
    else versions[0] = { ...next, createdAt: latest.createdAt };

    return {
      changed: true,
      payload: { versions: versions.slice(0, MAX_VERSIONS) }
    };
  }

  function latestRecoverableVersion(payload) {
    return (payload?.versions || []).find((version) => String(version.text || "").trim().length >= MIN_CHARACTERS) || null;
  }

  const api = {
    DAY_MS,
    VERSION_INTERVAL_MS,
    MIN_CHARACTERS,
    MAX_VERSIONS,
    STORAGE_LIMIT_BYTES,
    normalizePath,
    originPattern,
    fieldFingerprintSource,
    wordCount,
    isMateriallyShorter,
    isMateriallyDifferent,
    mergeSnapshot,
    latestRecoverableVersion
  };

  root.DraftBackCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
