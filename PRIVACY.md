# DraftBack privacy — 0.7.1

DraftBack's primary purpose is recovering an unfinished web form after a reload. It has no server, cloud sync, analytics or remote code. Restoring puts answers back into the website; that website can read or autosave them. DraftBack never submits an application.

## Automatic capture is opt-in

No website access is installed by default. Choose Protect this site and approve the browser prompt before typing. Access covers that site's paths (and ports, according to browser host-permission rules); capture is not restricted to just one application. Stop protection or remove website access in Settings when finished.

Capture records edits to supported visible, editable inputs, textareas, native single/multiple selects, radio choices, ordinary checkboxes, and plain-text contenteditable regions. There is no character minimum. Open shadow roots and accessible same-origin frames are included. Anonymous or ambiguous fields are skipped.

Names, contact details, dates, addresses, application answers and other personal information may be captured on an allowed site. Enable this only where you are comfortable retaining those answers temporarily. Label/type-based exclusions cover passwords, login/security answers, payment/card/bank identifiers, recognized government identity numbers, CAPTCHA/OTP controls, uploads and legal consent/declarations. This heuristic cannot identify every sensitive question or language; it is not a guarantee that all sensitive data is filtered. Hidden, disabled, readonly and unsupported custom widgets are also excluded.

## Local storage and matching

Answers and field identities are encrypted with AES-GCM in extension local storage, using a non-extractable key in extension-owned IndexedDB. Unencrypted record metadata includes the website origin, a hashed page/session fingerprint, generic form label, timestamps and expiry. The exact page URL (including query/fragment) and a random tab token are kept in extension session memory for safe matching. A random, non-secret token is also stored in the website tab's sessionStorage; answers are not placed there. The website can see or clear that token.

Recovery matches the same exact URL and tab session, then uniquely identifiable fields. Different tabs and different application URLs are kept separate. Losing tab sessionStorage, opening a fresh tab, changed URLs/field identifiers, closed shadow roots or cross-origin embedded forms can prevent recovery. Do not rely on this as a permanent backup or universal browser-crash recovery.

Drafts expire 24 hours after the latest changed snapshot. Expired drafts cannot be restored; cleanup occurs at startup, settings and subsequent saves. Up to five internal recent snapshots are retained within a 5 MB total draft-storage ceiling; the oldest unpinned drafts can be evicted. A form is limited to 1,000 captured controls and 300,000 serialized characters. The recovery UI restores the latest snapshot, not a per-field version picker.

Saving starts immediately on supported edit events, but is asynchronous. Wait for Saved locally. Crashing or closing before the save acknowledgement may lose recent edits. A website clearing fields without edit events does not overwrite the saved draft. An intentional edit clearing a field does update it. Newer user edits and nonempty written answers are preserved on restoration; review restored selection controls.

## Deletion and optional profile

Delete site drafts clears that site's saved drafts; Delete all data also clears the optional profile, import candidates, demo data and encryption key. Pending old-scope saves are invalidated. Removing the extension deletes extension-owned storage. Existing older writing records are retained until expiry/deletion; the new UI does not migrate them into whole-form recovery.

Profile autofill is optional, separate from recovery and available under Optional autofill tools. Only recognized reusable fields can be imported after a user action and review. The AES-GCM-encrypted profile persists until deletion, not just 24 hours. DraftBack's trusted pages can retrieve it; website content scripts cannot. Undo cannot retract information already received by a website.

The guided tutorial uses the real recovery engine with separate session-only practice storage. It does not alter your profile. Practice progress and a random token are stored in the tutorial tab's sessionStorage.

Encryption does not protect against malware, a compromised browser/extension or someone using your unlocked browser. Private/incognito capture is rejected. The Safari prototype is not the 0.7.1 Chromium build.
