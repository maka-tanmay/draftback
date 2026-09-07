"use strict";
const form = document.getElementById("profile-form");
const status = document.getElementById("profile-status");
async function profileCall(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Could not access your profile.");
  return response.value;
}
async function loadProfile() {
  const saved = await profileCall({ type: "profile:get" });
  const candidate = (await chrome.storage.session.get("profileCandidate")).profileCandidate;
  const imported = candidate && Date.now() - candidate.createdAt < 10 * 60 * 1000 ? candidate : null;
  const values = { ...saved, ...imported?.profile };
  if (candidate) await chrome.storage.session.remove("profileCandidate");
  if (imported) document.getElementById("import-status").textContent = `Review ${Object.keys(imported.profile).length} details found on the form. Nothing is saved until you choose Save profile.${imported.conflicts ? ` ${imported.conflicts} conflicting details were skipped.` : ""}`;
  const basic=new Set(['firstName','lastName','email','phone']);
  const extra=document.createElement('details');extra.className='profile-extra recovery-details';
  const summary=document.createElement('summary');summary.textContent='Add address, work and other details (optional)';extra.append(summary);
  const extraFields=document.createElement('div');extraFields.className='profile-grid';extra.append(extraFields);
  extra.open=Object.keys(values).some(key=>!basic.has(key)&&values[key]);
  for (const [key, title] of Object.entries(DraftBackAutofill.fields)) {
    const label = document.createElement("label");
    label.textContent = title;
    const input = document.createElement("input");
    input.name = key;
    input.type = key === "birthDate" ? "date" : key === "email" ? "email" : "text";
    input.maxLength = 500;
    input.value = values[key] || "";
    label.append(input);
    (basic.has(key)?document.getElementById("profile-fields"):extraFields).append(label);
  }
  document.getElementById('profile-fields').append(extra);
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await profileCall({ type: "profile:save", profile: Object.fromEntries(new FormData(form)) });
    status.textContent = "Profile saved. Return to your application, open DraftBack, and choose Fill this form.";
  } catch (error) { status.textContent = error.message; }
});
document.getElementById("delete-profile").addEventListener("click", async () => {
  if (!confirm("Delete your saved autofill profile?")) return;
  try { await profileCall({ type: "profile:delete" }); form.reset(); for (const input of form.querySelectorAll("input")) input.value = ""; status.textContent = "Profile deleted."; }
  catch (error) { status.textContent = error.message; }
});
loadProfile().catch(error => { status.textContent = error.message; });
