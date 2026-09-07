# DraftBack

A reload shouldn't mean starting your application again.

DraftBack 0.7.1 protects answers **as you fill a form**, then offers to restore them after a reload. No profile setup or manual Remember button is needed.

1. Open the application and choose **Protect this site** in DraftBack.
2. Approve website access. Fill the form normally.
3. Wait for **Saved locally**.
4. After a reload, choose **Restore my answers**, review, and continue.

The first-install walkthrough demonstrates this with sample answers and a real page reload. Optional profile autofill is separate, under Optional autofill tools.

## Supported recovery

Short text (even one character), long answers, email/phone/URL fields, numbers, native date/time controls, native single/multiple dropdowns, radio groups, ordinary checkboxes, and plain-text editable regions. Open shadow roots, accessible same-origin frames, conditional sections and rerendered fields are handled when stable unique field identities remain available.

Newer edits and nonempty written answers are preserved. Anonymous/ambiguous matches are not guessed. Protection is limited to allowed sites, the same tab session and exact application URL. Returning to an earlier exact wizard route can recover its draft; a new URL is a separate draft.

Passwords, security/payment fields, recognized identity numbers, uploads and consent are excluded. Exclusions are label/type heuristics, not a universal sensitive-data detector. Custom widgets, closed shadow roots, cross-origin frames, PDFs, inaccessible/login-only stages and changing field identifiers are not universally supported. No 99% reliability claim has been established.

## Install and test

Download the ZIP from [Releases](https://github.com/maka-tanmay/draftback/releases/latest), then follow [INSTALL.md](INSTALL.md). This is an unpacked Chromium extension, not a published browser-store release. Keep the extension folder in a stable location.

The [privacy policy](PRIVACY.md) explains temporary encrypted storage, site-wide access, exclusions and deletion. Drafts expire in 24 hours and may be evicted at the 5 MB cap. Wait for the save acknowledgement: a crash before that can lose the last edit. Browser-session loss is not guaranteed recoverable.

## Development

No dependency installation is needed:

```sh
npm test
npm run check
npm run package:chromium
```

Recovery tests are separate from historical profile-autofill tests. See [PUBLIC-TESTING.md](PUBLIC-TESTING.md) and [RELIABILITY.md](RELIABILITY.md).

The automated browser matrix uses an isolated runtime-identical test copy with only named test hosts preauthorized. Production retains optional permissions; native grant/deny UI verification is a separate acceptance item.

Safari is not included in this Chromium release. Tests never submit real applications.
