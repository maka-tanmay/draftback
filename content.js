(function () {
  "use strict";
  if (globalThis.__draftbackLoaded) return;
  globalThis.__draftbackLoaded = true;

  const states = new WeakMap();
  const statesByFingerprint = new Map();
  const dismissed = new Set();
  let lastFocused = null;
  let permissionActive = true;
  let indicatorEnabled = true;

  const styles = `
    :host { all: initial; position: relative; z-index: 2147483646; display: block; width: fit-content; max-width: min(460px, 100%); margin: 7px 0 9px 2px; color-scheme: dark; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    .pill, .panel { color: #f7f6ff; background: #171a2b; border: 1px solid #4a4f6a; box-shadow: 0 10px 28px rgba(5,6,18,.34); }
    .pill { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 7px; min-height: 36px; max-width: min(460px, calc(100vw - 24px)); border-radius: 11px; padding: 7px 8px 7px 9px; font: 640 13px/1.3 inherit; }
    .pill button { margin-left: 2px; }
    .icon { display: grid; place-items: center; flex: 0 0 auto; width: 19px; height: 19px; border: 1px solid #b62d5c; border-radius: 50%; color: #ff9fbd; background: #3a1e32; font-size: 12px; line-height: 1; text-align: center; }
    .protected .icon, .deleted .icon { border-color: #4b8f73; color: #a1e7cb; background: #18372f; }
    .removed .icon, .unsupported .icon, .error .icon { border-color: #9a4656; color: #ffb3be; background: #40232d; }
    button { appearance: none; min-height: 34px; padding: 6px 9px; border: 1px solid #666c89; border-radius: 8px; color: #f7f6ff; background: #23273d; font: 630 12px/1.25 inherit; cursor: pointer; transition: border-color 160ms ease-out, background-color 160ms ease-out, transform 120ms ease-out; }
    button:hover { border-color: #ff6b9a; background: #3a1e32; }
    button:active { transform: translateY(1px); }
    button:focus-visible, summary:focus-visible { outline: 3px solid #ff9fbd; outline-offset: 2px; }
    button.primary { color: #fff; background: #c82d62; border-color: #ed5d8c; }
    button.primary:hover { background: #de3b70; }
    button.danger { color: #ffb3be; }
    .panel { width: min(460px, calc(100vw - 24px)); margin-top: 7px; padding: 16px; border-radius: 14px; font: 14px/1.5 inherit; animation: db-enter 180ms cubic-bezier(.22,1,.36,1) both; }
    .panel > strong { display: block; margin-bottom: 4px; font-size: 18px; font-weight: 720; letter-spacing: -.025em; }
    .muted { color: #c3c6d8; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
    .version { padding: 12px 0; border-top: 1px solid #414661; }
    .version:first-of-type { margin-top: 10px; }
    details { margin-top: 7px; }
    summary { cursor: pointer; font-weight: 600; }
    pre { max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 8px 0 0; padding: 10px; border: 1px solid #3d425d; border-radius: 8px; color: #f7f6ff; background: #111321; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .saving .icon { animation: db-turn 180ms cubic-bezier(.22,1,.36,1) 1; }
    @keyframes db-turn { from { transform: rotate(-12deg); opacity: .7; } to { transform: rotate(0); opacity: 1; } }
    @keyframes db-enter { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } button:active { transform: none; } }
  `;

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!response?.ok) return reject(new Error(response?.error || "DraftBack request failed."));
        resolve(response.value);
      });
    });
  }

  function supported(element) {
    if (element.dataset?.draftbackUi !== undefined) return false;
    if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
    return element instanceof HTMLElement && element.isContentEditable && !element.parentElement?.isContentEditable;
  }

  function readText(element) {
    if (element instanceof HTMLTextAreaElement) return element.value;
    return element.innerText || "";
  }

  function cleanIdentity(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function labelledText(element) {
    if (element instanceof HTMLTextAreaElement && element.labels?.length) {
      return cleanIdentity(Array.from(element.labels).map((label) => label.textContent).join(" "));
    }
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      return cleanIdentity(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "));
    }
    return "";
  }

  function descriptor(element) {
    const form = element.closest("form");
    let actionPath = "";
    if (form?.getAttribute("action")) {
      try { actionPath = DraftBackCore.normalizePath(new URL(form.getAttribute("action"), location.href).pathname); } catch {}
    }
    const formIdentity = cleanIdentity(form?.id || form?.getAttribute("name") || form?.getAttribute("aria-label") || actionPath);
    const fieldIdentity = cleanIdentity(
      element.id || element.getAttribute("name") || element.getAttribute("aria-label") || labelledText(element)
    );
    const peers = Array.from((form || document).querySelectorAll("textarea, [contenteditable]"))
      .filter(supported)
      .filter((peer) => peer.tagName === element.tagName);
    return {
      origin: location.origin,
      pathname: location.pathname,
      pathPattern: DraftBackCore.normalizePath(location.pathname),
      formIdentity,
      fieldIdentity,
      tag: element instanceof HTMLTextAreaElement ? "textarea" : "contenteditable",
      ordinal: Math.max(0, peers.indexOf(element)),
      confidence: fieldIdentity ? "exact" : "uncertain"
    };
  }

  async function fingerprintFor(details) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(DraftBackCore.fieldFingerprintSource(details)));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function relativeTime(timestamp) {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  function mount(element) {
    const host = document.createElement("span");
    host.dataset.draftbackUi = "";
    host.setAttribute("aria-live", "polite");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = styles;
    shadow.append(style);
    element.insertAdjacentElement("afterend", host);
    return { host, shadow };
  }

  function button(label, action, className = "") {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.className = className;
    element.addEventListener("click", action);
    return element;
  }

  function renderStatus(state, kind, label) {
    if (!state.ui || dismissed.has(state.fingerprint)) return;
    if (!indicatorEnabled && (kind === "saving" || kind === "protected")) {
      state.ui.host.hidden = true;
      return;
    }
    state.ui.host.hidden = false;
    const icons = { saving: "↻", protected: "✓", recovery: "↩", removed: "!", unsupported: "×", deleted: "✓", error: "!" };
    state.ui.shadow.replaceChildren(state.ui.shadow.querySelector("style"));
    const pill = document.createElement("span");
    pill.className = `pill ${kind}`;
    pill.setAttribute("role", "status");
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = icons[kind] || "•";
    const text = document.createElement("span");
    text.textContent = label;
    pill.append(icon, text);
    if (kind !== "removed" && kind !== "unsupported" && kind !== "deleted") {
      pill.append(button("Recent versions", () => showVersions(state)));
    }
    pill.append(button("Hide", () => {
      dismissed.add(state.fingerprint);
      state.ui.host.hidden = true;
    }));
    state.ui.shadow.append(pill);
  }

  async function copyText(text, state) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const helper = document.createElement("textarea");
      helper.dataset.draftbackUi = "";
      helper.value = text;
      helper.style.cssText = "position:fixed;left:-10000px;top:0";
      document.body.append(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    renderStatus(state, "protected", "Copied saved writing");
  }

  function writeText(element, text) {
    element.focus();
    if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setter) throw new Error("This page blocks safe restoration.");
      setter.call(element, text);
    } else {
      element.textContent = text;
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: null }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function save(state, options = {}) {
    if (!permissionActive) return false;
    const text = readText(state.element);
    if (!state.protected && text.trim().length < DraftBackCore.MIN_CHARACTERS && !options.forceVersion) return false;
    state.protected = true;
    const latestText = DraftBackCore.latestRecoverableVersion(state.record)?.text;
    const forceVersion = Boolean(options.forceVersion) || Boolean(latestText && DraftBackCore.isMateriallyShorter(text, latestText));
    const value = await send({
      type: "data:save",
      fingerprint: state.fingerprint,
      origin: location.origin,
      pathPattern: state.details.pathPattern,
      confidence: state.details.confidence,
      text,
      forceVersion,
      versionId: crypto.randomUUID()
    });
    state.record = value.record;
    state.dirty = false;
    return true;
  }

  async function restore(state, version) {
    const current = readText(state.element);
    if (current.trim() && current !== version.text && !window.confirm("Replace the current writing with this saved version? Your current text will be saved first.")) return;
    try {
      if (current.trim() && current !== version.text) await save(state, { forceVersion: true });
      writeText(state.element, version.text);
      await save(state, { forceVersion: true });
      renderStatus(state, "protected", `Restored ${version.words.toLocaleString()} words locally`);
    } catch {
      await copyText(version.text, state);
      renderStatus(state, "error", "Restoration was blocked — saved writing copied instead");
    }
  }

  function renderPanel(state, title, subtitle) {
    state.ui.host.hidden = false;
    state.ui.shadow.replaceChildren(state.ui.shadow.querySelector("style"));
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    const heading = document.createElement("strong");
    heading.textContent = title;
    const description = document.createElement("div");
    description.className = "muted";
    description.textContent = subtitle;
    panel.append(heading, description);
    state.ui.shadow.append(panel);
    return panel;
  }

  async function showVersions(state) {
    const record = await send({ type: "data:getRecord", fingerprint: state.fingerprint });
    if (!record?.versions?.length) return renderStatus(state, "deleted", "No saved versions remain");
    state.record = record;
    const panel = renderPanel(state, "Recent versions", "Choose a saved version to preview, copy, or restore.");
    for (const version of record.versions) {
      const row = document.createElement("div");
      row.className = "version";
      const meta = document.createElement("strong");
      meta.textContent = `${version.words.toLocaleString()} words · ${relativeTime(version.savedAt)}`;
      const preview = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Preview text";
      const text = document.createElement("pre");
      text.textContent = version.text;
      preview.append(summary, text);
      const actions = document.createElement("div");
      actions.className = "actions";
      if (state.details.confidence === "exact" && record.confidence === "exact") {
        actions.append(button("Restore", () => restore(state, version), "primary"));
      }
      actions.append(button("Copy", () => copyText(version.text, state)));
      row.append(meta, preview, actions);
      panel.append(row);
    }
    const close = document.createElement("div");
    close.className = "actions";
    close.append(button("Close", () => renderStatus(state, "protected", `Protected locally · expires in 24 hours`)));
    panel.append(close);
  }

  function showRecovery(state, version, exact) {
    if (dismissed.has(state.fingerprint)) return;
    const panel = renderPanel(
      state,
      exact ? "Recovery available" : "Saved writing found — field match uncertain",
      `${version.words.toLocaleString()} words were saved ${relativeTime(version.savedAt)}.`
    );
    const actions = document.createElement("div");
    actions.className = "actions";
    if (exact) actions.append(button("Restore", () => restore(state, version), "primary"));
    actions.append(
      button("Recent versions", () => showVersions(state)),
      button("Copy", () => copyText(version.text, state)),
      button("Dismiss", () => {
        dismissed.add(state.fingerprint);
        state.ui.host.hidden = true;
      }),
      button("Delete", async () => {
        if (!window.confirm("Delete every saved version for this writing field?")) return;
        await send({ type: "data:deleteRecord", fingerprint: state.fingerprint });
        state.record = null;
        renderStatus(state, "deleted", "Saved writing deleted");
      }, "danger")
    );
    panel.append(actions);
  }

  function scheduleSave(state) {
    if (!permissionActive) return;
    if (state.details.pathPattern !== DraftBackCore.normalizePath(location.pathname)) {
      rebindState(state, true);
      return;
    }
    const text = readText(state.element);
    if (!state.protected && text.trim().length < DraftBackCore.MIN_CHARACTERS) return;
    state.protected = true;
    if (!state.ui) state.ui = mount(state.element);
    renderStatus(state, "saving", "Saving locally…");
    clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      try {
        await save(state);
        renderStatus(state, "protected", "Protected locally · expires in 24 hours");
      } catch (error) {
        if (/private browsing/i.test(error.message)) {
          permissionActive = false;
          renderStatus(state, "unsupported", "Private browsing unsupported · nothing was saved");
          return;
        }
        permissionActive = !/permission/i.test(error.message);
        renderStatus(state, permissionActive ? "error" : "removed", permissionActive ? "Could not save locally" : "Permission removed · protection stopped");
      }
    }, 1000);
  }

  function rebindState(state, captureCurrent = false) {
    clearTimeout(state.timer);
    state.controller.abort();
    state.ui?.host.remove();
    statesByFingerprint.delete(state.fingerprint);
    states.delete(state.element);
    if (lastFocused === state) lastFocused = null;
    registerField(state.element, captureCurrent).catch(() => {});
  }

  function refreshRoute() {
    const currentPath = DraftBackCore.normalizePath(location.pathname);
    for (const state of [...statesByFingerprint.values()]) {
      if (state.element.isConnected && state.details.pathPattern !== currentPath) rebindState(state);
    }
  }

  async function registerField(element, captureCurrent = false) {
    if (states.has(element) || !supported(element)) return;
    states.set(element, null);
    const details = descriptor(element);
    const fingerprint = await fingerprintFor(details);
    const state = { element, details, fingerprint, protected: false, dirty: false, timer: null, ui: null, record: null, controller: new AbortController() };
    states.set(element, state);
    statesByFingerprint.set(fingerprint, state);
    const record = await send({ type: "data:getRecord", fingerprint });
    state.record = record;

    if (record) {
      state.protected = true;
      state.ui = mount(element);
      const version = DraftBackCore.latestRecoverableVersion(record);
      if (version && DraftBackCore.isMateriallyShorter(readText(element), version.text)) {
        showRecovery(state, version, details.confidence === "exact" && record.confidence === "exact");
      } else {
        renderStatus(state, "protected", "Protected locally · expires in 24 hours");
      }
    }

    element.addEventListener("focus", () => { lastFocused = state; }, { capture: true, signal: state.controller.signal });
    element.addEventListener("input", () => {
      state.dirty = true;
      scheduleSave(state);
    }, { capture: true, signal: state.controller.signal });
    if (captureCurrent) {
      state.dirty = true;
      scheduleSave(state);
    }
  }

  function markUnsupported(element) {
    if (states.has(element)) return;
    states.set(element, null);
    const ui = mount(element);
    const state = { element, fingerprint: `unsupported-${Date.now()}`, ui };
    renderStatus(state, "unsupported", "Unsupported editor · DraftBack is not saving this field");
  }

  function scan(root = document) {
    const candidates = [];
    if (root.matches?.("textarea, [contenteditable], [role='textbox'][aria-multiline='true']")) candidates.push(root);
    candidates.push(...root.querySelectorAll?.("textarea, [contenteditable], [role='textbox'][aria-multiline='true']") || []);
    for (const element of candidates) {
      if (element.dataset?.draftbackUi !== undefined) continue;
      if (supported(element)) registerField(element).catch(() => {});
      else if (!(element instanceof HTMLInputElement) && element.matches("[role='textbox'][aria-multiline='true']")) markUnsupported(element);
    }
  }

  new MutationObserver((mutations) => {
    refreshRoute();
    for (const mutation of mutations) for (const node of mutation.addedNodes) if (node instanceof Element) scan(node);
  }).observe(document.documentElement, { childList: true, subtree: true });

  addEventListener("popstate", refreshRoute);
  globalThis.navigation?.addEventListener("navigatesuccess", refreshRoute);

  document.addEventListener("submit", () => {
    for (const state of statesByFingerprint.values()) {
      if (!state.protected) continue;
      clearTimeout(state.timer);
      (state.dirty ? save(state) : Promise.resolve(true))
        .then(() => send({ type: "data:markSubmitted", fingerprint: state.fingerprint, origin: location.origin }))
        .catch(() => {});
    }
  }, true);

  addEventListener("pagehide", () => {
    for (const state of statesByFingerprint.values()) {
      if (state.protected && state.dirty) save(state).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "permission:removed" && message.pattern === DraftBackCore.originPattern(location.origin)) {
      permissionActive = false;
      for (const state of statesByFingerprint.values()) {
        clearTimeout(state.timer);
        if (state.ui) renderStatus(state, "removed", "Permission removed · protection stopped");
      }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "ui:getActiveField") {
      sendResponse({ ok: true, fingerprint: lastFocused?.fingerprint || null });
      return;
    }
    if (message?.type === "ui:showRecent") {
      const state = statesByFingerprint.get(message.fingerprint) || lastFocused;
      if (state) showVersions(state).catch(() => {});
      sendResponse({ ok: Boolean(state) });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.indicatorEnabled) return;
    indicatorEnabled = changes.indicatorEnabled.newValue !== false;
    for (const state of statesByFingerprint.values()) {
      if (!state.ui) continue;
      if (indicatorEnabled && state.protected) renderStatus(state, "protected", "Protected locally · expires in 24 hours");
      else if (!indicatorEnabled) state.ui.host.hidden = true;
    }
  });

  chrome.storage.local.get({ indicatorEnabled: true }).then((preferences) => {
    indicatorEnabled = preferences.indicatorEnabled;
    send({ type: "data:clearExpired" }).catch(() => {});
    scan();
  });
})();
