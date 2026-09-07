"use strict";

const sitesElement = document.getElementById("sites");
const statusElement = document.getElementById("status");
const indicatorElement = document.getElementById("indicator-enabled");

function call(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
    if (!response?.ok) return reject(new Error(response?.error || "DraftBack request failed."));
    resolve(response.value);
  }));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}

function originFromPattern(pattern) {
  try { return new URL(pattern.replace("*", "")).origin; } catch { return null; }
}

async function load() {
  await call({ type: "data:clearExpired" });
  const [permissionData, stats, preferences] = await Promise.all([
    chrome.permissions.getAll(),
    call({ type: "data:stats" }),
    chrome.storage.local.get({ indicatorEnabled: true })
  ]);
  document.getElementById("storage-used").textContent = formatBytes(stats.bytes);
  document.getElementById("record-count").textContent = `${stats.records} active draft${stats.records === 1 ? "" : "s"} on ${stats.sites} site${stats.sites === 1 ? "" : "s"}`;
  indicatorElement.checked = preferences.indicatorEnabled;

  sitesElement.replaceChildren();
  const origins = (permissionData.origins || []).map(originFromPattern).filter(Boolean).sort();
  if (!origins.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No websites are allowed. Use the toolbar button on a site to grant access.";
    sitesElement.append(empty);
    return;
  }
  for (const origin of origins) {
    const row = document.createElement("div");
    row.className = "row";
    const site = document.createElement("div");
    site.className = "site";
    const name = document.createElement("strong");
    name.textContent = origin;
    const detail = document.createElement("div");
    detail.className = "muted";
    const records = await call({ type: "data:listSite", origin });
    detail.textContent = `${records.length} active draft${records.length === 1 ? "" : "s"}`;
    site.append(name, detail);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "danger";
    clear.textContent = "Clear drafts";
    clear.setAttribute("aria-label", `Clear saved drafts for ${origin}`);
    clear.addEventListener("click", async () => {
      if (!confirm(`Delete every DraftBack version saved for ${origin}?`)) return;
      const removed = await call({ type: "data:clearSite", origin });
      statusElement.textContent = `Deleted ${removed} draft${removed === 1 ? "" : "s"} from ${origin}.`;
      await load();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove access";
    remove.setAttribute("aria-label", `Remove DraftBack website access for ${origin}`);
    remove.addEventListener("click", async () => {
      if (!confirm(`Stop protecting future writing on ${origin}?`)) return;
      await chrome.permissions.remove({ origins: [DraftBackCore.originPattern(origin)] });
      await call({ type: "site:unregister", origin });
      statusElement.textContent = `Access removed for ${origin}.`;
      await load();
    });
    actions.append(clear, remove);
    row.append(site, actions);
    sitesElement.append(row);
  }
}

indicatorElement.addEventListener("change", async () => {
  await chrome.storage.local.set({ indicatorEnabled: indicatorElement.checked });
  statusElement.textContent = indicatorElement.checked ? "In-page protection indicators enabled." : "Indicators hidden. Recovery prompts remain enabled.";
});

document.getElementById("clear-expired").addEventListener("click", async () => {
  const removed = await call({ type: "data:clearExpired" });
  statusElement.textContent = `Cleared ${removed} expired draft${removed === 1 ? "" : "s"}.`;
  await load();
});

document.getElementById("clear-all").addEventListener("click", async () => {
  if (!confirm("Delete your autofill profile, every saved draft, and the local encryption key?")) return;
  await call({ type: "data:clearAll" });
  statusElement.textContent = "All DraftBack data and the encryption key were deleted.";
  await load();
});

load().catch((error) => { statusElement.textContent = error.message; });
